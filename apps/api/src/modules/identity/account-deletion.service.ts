import { Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray, or } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookingPassengers, bookings } from '../bookings/bookings.schema.js';
import { pushDevices } from '../notifications/notifications.schema.js';
import { memberships } from '../organizations/organizations.schema.js';
import { payments } from '../payments/payments.schema.js';
import { taxiRides } from '../taxi/taxi.schema.js';
import { tripPacks } from '../trip-packs/trip-packs.schema.js';
import { otpChallenges, sessions, users } from './identity.schema.js';
import type { Authenticated, RequestMeta } from './sessions.service.js';

const conflict = ApiException.conflict;

/**
 * Deletes an account at its owner's request (docs/legal/conservacion-y-borrado.md): erases the
 * personal data of the account and ends its access. Records the law requires keeping (bookings,
 * payments, passenger lists, KYC files) stay, no longer tied to an active account.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async delete(auth: Authenticated, meta: RequestMeta): Promise<void> {
    const userId = auth.user.id;
    await this.database.db.transaction(async (tx) => {
      // Lock the account so a booking or payment cannot start while it is being deleted.
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user || user.status === 'deleted') return;

      const [trips] = await tx
        .select({ n: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.userId, userId),
            eq(bookings.status, 'confirmed'),
            gt(bookings.departsAt, new Date()),
          ),
        );
      const [taxis] = await tx
        .select({ n: count() })
        .from(taxiRides)
        .where(
          and(
            eq(taxiRides.passengerUserId, userId),
            inArray(taxiRides.status, ['requested', 'accepted', 'in_progress']),
          ),
        );
      if ((trips?.n ?? 0) > 0 || (taxis?.n ?? 0) > 0) {
        throw conflict('Cancel or take your upcoming trips first', 'ACCOUNT_HAS_TRIPS');
      }
      const [money] = await tx
        .select({ n: count() })
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            or(eq(payments.status, 'reported'), eq(payments.status, 'refund_due')),
          ),
        );
      if ((money?.n ?? 0) > 0) {
        throw conflict('A payment is being checked or refunded', 'ACCOUNT_HAS_REFUNDS');
      }
      const owned = await tx
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.role, 'owner')));
      for (const { organizationId } of owned) {
        const [owners] = await tx
          .select({ n: count() })
          .from(memberships)
          .where(
            and(eq(memberships.organizationId, organizationId), eq(memberships.role, 'owner')),
          );
        if ((owners?.n ?? 0) <= 1) {
          throw conflict(
            'Hand the organization to another owner first',
            'ACCOUNT_OWNS_ORGANIZATION',
          );
        }
      }

      // Unpaid trip packs are cancelled; paid ones lose their unused trips (packs are not
      // refunded, ADR-028).
      const unpaidPacks = await tx
        .update(tripPacks)
        .set({ status: 'cancelled', paymentDueAt: null, updatedAt: new Date() })
        .where(and(eq(tripPacks.userId, userId), eq(tripPacks.status, 'pending_payment')))
        .returning({ id: tripPacks.id });
      if (unpaidPacks.length) {
        await tx
          .update(payments)
          .set({ status: 'cancelled' })
          .where(
            and(
              inArray(
                payments.tripPackId,
                unpaidPacks.map((p) => p.id),
              ),
              eq(payments.status, 'pending'),
            ),
          );
      }

      // Unpaid holds are released, as if the person cancelled them.
      const held = await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), expiresAt: null })
        .where(and(eq(bookings.userId, userId), eq(bookings.status, 'held')))
        .returning({ id: bookings.id });
      if (held.length) {
        await tx
          .update(bookingPassengers)
          .set({ active: false })
          .where(
            inArray(
              bookingPassengers.bookingId,
              held.map((b) => b.id),
            ),
          );
        await tx
          .update(payments)
          .set({ status: 'cancelled' })
          .where(
            and(
              inArray(
                payments.bookingId,
                held.map((b) => b.id),
              ),
              eq(payments.status, 'pending'),
            ),
          );
      }

      const contacts = [user.email, user.phone].filter((c): c is string => Boolean(c));
      if (contacts.length) {
        await tx.delete(otpChallenges).where(inArray(otpChallenges.destination, contacts));
      }
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'account_deleted' })
        .where(eq(sessions.userId, userId));
      await tx.delete(pushDevices).where(eq(pushDevices.userId, userId));
      // Fiscal documents (`invoices`) keep the buyer's name and ID: the tax code requires keeping
      // issued invoices, and a paid booking's draft is issued all the same (ADR-031).
      await tx
        .update(bookings)
        .set({
          billingName: null,
          billingIdType: null,
          billingIdNumber: null,
          billingAddress: null,
        })
        .where(eq(bookings.userId, userId));
      await tx.delete(memberships).where(eq(memberships.userId, userId));
      await tx
        .update(users)
        .set({
          email: null,
          emailVerifiedAt: null,
          phone: null,
          phoneVerifiedAt: null,
          passwordHash: null,
          firstName: null,
          lastName: null,
          platformRole: null,
          status: 'deleted',
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
    await this.audit.record({
      action: 'user.deleted',
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ip: meta.ip,
    });
  }
}

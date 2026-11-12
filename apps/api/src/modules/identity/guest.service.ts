import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LEGAL_VERSION,
  type AuthClient,
  type AuthResponse,
  type UpgradeGuestRequest,
  type UserProfile,
} from '@vtp/shared-types';
import { and, eq } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { bookings } from '../bookings/bookings.schema.js';
import { notifications, pushDevices } from '../notifications/notifications.schema.js';
import { payments } from '../payments/payments.schema.js';
import { taxiRides } from '../taxi/taxi.schema.js';
import { normalizeEmail } from './contact.js';
import { hashPassword } from './crypto/password-hasher.js';
import { users, type User } from './identity.schema.js';
import { SessionsService, type Authenticated, type RequestMeta } from './sessions.service.js';
import { UsersService } from './users.service.js';

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505' ||
  (error as { code?: string }).code === '23505';

/** Organization, KYC and staff features need a registered account, never a guest (ADR-034). */
export function assertNotGuest(auth: Authenticated): void {
  if (auth.user.guest) {
    throw ApiException.conflict('Create your account first', 'ACCOUNT_REQUIRED');
  }
}

/**
 * Guests (ADR-034): the passenger app buys without registering. A guest is a user without
 * e-mail, phone or password whose session lives on one phone. Registering turns it into a normal
 * account; signing in to an existing account moves its trips there.
 */
@Injectable()
export class GuestService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async create(client: AuthClient, meta: RequestMeta): Promise<AuthResponse> {
    const [user] = await this.database.db
      .insert(users)
      .values({ guest: true, termsVersion: LEGAL_VERSION, termsAcceptedAt: new Date() })
      .returning();
    await this.audit.record({
      action: 'auth.guest',
      actorUserId: user!.id,
      ip: meta.ip,
      metadata: { termsVersion: LEGAL_VERSION, client },
    });
    return {
      user: this.users.toProfile(user!),
      tokens: await this.sessions.create(user!.id, client, meta),
    };
  }

  /** The guest becomes a normal account with e-mail and password, keeping its trips. */
  async upgrade(
    auth: Authenticated,
    input: UpgradeGuestRequest,
    meta: RequestMeta,
  ): Promise<UserProfile> {
    if (!auth.user.guest) throw ApiException.conflict('Already registered', 'NOT_A_GUEST');
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new ApiException('VALIDATION_FAILED', 'Invalid e-mail', HttpStatus.BAD_REQUEST);
    }
    let user: User | undefined;
    try {
      [user] = await this.database.db
        .update(users)
        .set({
          email,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          guest: false,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, auth.user.id), eq(users.guest, true)))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.conflict('An account with this e-mail already exists', 'EMAIL_TAKEN');
      }
      throw error;
    }
    if (!user) throw ApiException.conflict('Already registered', 'NOT_A_GUEST');
    await this.audit.record({ action: 'auth.guest_upgraded', actorUserId: user.id, ip: meta.ip });
    return this.users.toProfile(user);
  }

  /**
   * After signing in to an existing account on a phone that bought as a guest: the guest's trips,
   * payments, taxi rides and notices move to the account, and the guest is closed. Holding the
   * guest's access token proves the phone is the one that bought.
   */
  async claim(
    auth: Authenticated,
    guestAccessToken: string,
    meta: RequestMeta,
  ): Promise<{ bookings: number }> {
    if (auth.user.guest) {
      throw ApiException.conflict('Sign in to a registered account first', 'ACCOUNT_REQUIRED');
    }
    const guest = await this.sessions.authenticate(guestAccessToken);
    if (!guest || !guest.user.guest || guest.user.id === auth.user.id) {
      throw new ApiException('NOT_FOUND', 'Guest session not found', HttpStatus.NOT_FOUND);
    }
    const from = guest.user.id;
    const to = auth.user.id;
    let moved: number;
    try {
      moved = await this.database.db.transaction(async (tx) => {
        const rows = await tx
          .update(bookings)
          .set({ userId: to })
          .where(eq(bookings.userId, from))
          .returning({ id: bookings.id });
        await tx.update(payments).set({ userId: to }).where(eq(payments.userId, from));
        await tx
          .update(taxiRides)
          .set({ passengerUserId: to })
          .where(eq(taxiRides.passengerUserId, from));
        await tx.update(notifications).set({ userId: to }).where(eq(notifications.userId, from));
        // The phone registers its push token again for the account.
        await tx.delete(pushDevices).where(eq(pushDevices.userId, from));
        await tx
          .update(users)
          .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, from));
        return rows.length;
      });
    } catch (error) {
      // Both had a taxi ride open at once: one has to finish first.
      if (isUniqueViolation(error)) {
        throw ApiException.conflict('Finish your open taxi ride first', 'TAXI_RIDE_OPEN');
      }
      throw error;
    }
    await this.sessions.revokeAll(from, 'guest_claimed');
    await this.audit.record({
      action: 'auth.guest_claimed',
      actorUserId: to,
      targetType: 'user',
      targetId: from,
      ip: meta.ip,
      metadata: { bookings: moved },
    });
    return { bookings: moved };
  }
}

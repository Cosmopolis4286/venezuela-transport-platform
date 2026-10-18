import { HttpStatus, Injectable } from '@nestjs/common';
import type { UserProfile } from '@vtp/shared-types';
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { DatabaseService } from '../../database/database.service.js';
import type { ContactKind } from './contact.js';
import { users, type User } from './identity.schema.js';

/** PostgreSQL unique_violation (23505), possibly wrapped by Drizzle in `cause`. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown })?.cause) === '23505';
}

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.database.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user;
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.database.db.select().from(users).where(inArray(users.id, ids));
  }

  /** The account that has proven control of this e-mail/phone, if any. */
  async findByVerifiedContact(kind: ContactKind, value: string): Promise<User | undefined> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(
        kind === 'email'
          ? and(eq(users.email, value), isNotNull(users.emailVerifiedAt))
          : and(eq(users.phone, value), isNotNull(users.phoneVerifiedAt)),
      )
      .limit(1);
    return user;
  }

  async createWithPassword(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    const [user] = await this.database.db
      .insert(users)
      .values(input)
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!user) {
      throw new ApiException(
        'CONFLICT',
        'An account with this e-mail already exists',
        HttpStatus.CONFLICT,
      );
    }
    return user;
  }

  /** Signs in by a contact the user just proved they control, creating the account on first use. */
  async findOrCreateByVerifiedContact(kind: ContactKind, value: string): Promise<User> {
    const column = kind === 'email' ? users.email : users.phone;
    const verifiedColumn = kind === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt';
    const [user] = await this.database.db
      .insert(users)
      .values({ [kind]: value, [verifiedColumn]: new Date() })
      .onConflictDoUpdate({
        target: column,
        set: { [verifiedColumn]: sql`coalesce(${users[verifiedColumn]}, now())` },
      })
      .returning();
    return user!;
  }

  /** Attaches a verified e-mail/phone to the user. Fails if another account already uses it. */
  async setVerifiedContact(userId: string, kind: ContactKind, value: string): Promise<User> {
    const column = kind === 'email' ? users.email : users.phone;
    const [taken] = await this.database.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(column, value), ne(users.id, userId)))
      .limit(1);
    if (taken) throw this.contactTaken(kind);
    const verifiedColumn = kind === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt';
    try {
      const [user] = await this.database.db
        .update(users)
        .set({ [kind]: value, [verifiedColumn]: new Date() })
        .where(eq(users.id, userId))
        .returning();
      return user!;
    } catch (error) {
      // Another account claimed the same contact between the check above and this update.
      if (isUniqueViolation(error)) throw this.contactTaken(kind);
      throw error;
    }
  }

  async updateProfile(
    userId: string,
    changes: { firstName?: string; lastName?: string },
  ): Promise<User> {
    const [user] = await this.database.db
      .update(users)
      .set(changes)
      .where(eq(users.id, userId))
      .returning();
    return user!;
  }

  /** Called by the onboarding module when KYC is approved. */
  async markIdentityVerified(
    userId: string,
    names: { firstName: string; lastName: string },
  ): Promise<void> {
    await this.database.db
      .update(users)
      .set({ identityVerifiedAt: new Date(), ...names })
      .where(eq(users.id, userId));
  }

  private contactTaken(kind: ContactKind): ApiException {
    return new ApiException(
      'CONFLICT',
      `This ${kind === 'email' ? 'e-mail' : 'phone number'} belongs to another account`,
      HttpStatus.CONFLICT,
    );
  }

  toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      phone: user.phone,
      phoneVerified: user.phoneVerifiedAt !== null,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      identityVerified: user.identityVerifiedAt !== null,
      platformRole: user.platformRole,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

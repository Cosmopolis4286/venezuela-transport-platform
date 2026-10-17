import { Injectable } from '@nestjs/common';
import type { AuthClient, AuthTokens } from '@vtp/shared-types';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from './crypto/token.service.js';
import { sessions, users, type Session, type User } from './identity.schema.js';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface Authenticated {
  user: User;
  session: Session;
}

/** Avoid a database write on every request: only bump last_used_at once per minute. */
const LAST_USED_RESOLUTION_MS = 60_000;

@Injectable()
export class SessionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, client: AuthClient, meta: RequestMeta): Promise<AuthTokens> {
    const issued = this.issueTokens();
    await this.database.db.insert(sessions).values({
      userId,
      client,
      accessTokenHash: this.tokens.hash(issued.tokens.accessToken),
      accessExpiresAt: issued.accessExpiresAt,
      refreshTokenHash: this.tokens.hash(issued.tokens.refreshToken),
      refreshExpiresAt: issued.refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ip: meta.ip ?? null,
    });
    return issued.tokens;
  }

  /** Resolves a bearer access token, or null if unknown, expired, revoked or the user is suspended. */
  async authenticate(accessToken: string): Promise<Authenticated | null> {
    const now = new Date();
    const [row] = await this.database.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.accessTokenHash, this.tokens.hash(accessToken)),
          isNull(sessions.revokedAt),
          gt(sessions.accessExpiresAt, now),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) return null;

    if (now.getTime() - row.session.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await this.database.db
        .update(sessions)
        .set({ lastUsedAt: now })
        .where(eq(sessions.id, row.session.id));
    }
    return row;
  }

  /**
   * Rotates both tokens. Presenting an already-rotated refresh token revokes the session:
   * either it was stolen or the client refreshed twice. Clients must serialize refresh calls.
   */
  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const db = this.database.db;
    const hash = this.tokens.hash(refreshToken);
    const now = new Date();

    const [current] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);

    if (!current) {
      const [replayed] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.previousRefreshTokenHash, hash), isNull(sessions.revokedAt)))
        .limit(1);
      if (replayed) {
        await this.revoke(replayed.id, 'refresh_token_reuse');
        await this.audit.record({
          action: 'auth.refresh.reuse_detected',
          actorUserId: replayed.userId,
          targetType: 'session',
          targetId: replayed.id,
          ip: meta.ip,
        });
      }
      throw ApiException.sessionExpired();
    }

    const { session, user } = current;
    if (session.revokedAt || session.refreshExpiresAt <= now || user.status !== 'active') {
      throw ApiException.sessionExpired();
    }

    const issued = this.issueTokens();
    const [rotated] = await db
      .update(sessions)
      .set({
        accessTokenHash: this.tokens.hash(issued.tokens.accessToken),
        accessExpiresAt: issued.accessExpiresAt,
        refreshTokenHash: this.tokens.hash(issued.tokens.refreshToken),
        previousRefreshTokenHash: hash,
        refreshExpiresAt: issued.refreshExpiresAt,
        lastUsedAt: now,
        ip: meta.ip ?? session.ip,
      })
      // Only the first of two concurrent refreshes wins; the other sees no row.
      .where(and(eq(sessions.id, session.id), eq(sessions.refreshTokenHash, hash)))
      .returning({ id: sessions.id });
    if (!rotated) throw ApiException.sessionExpired();
    return { user, tokens: issued.tokens };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  private issueTokens() {
    const now = Date.now();
    const accessExpiresAt = new Date(
      now + this.config.get('AUTH_ACCESS_TOKEN_TTL_MINUTES') * 60_000,
    );
    const refreshExpiresAt = new Date(
      now + this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    const tokens: AuthTokens = {
      tokenType: 'Bearer',
      accessToken: this.tokens.generate('access'),
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshToken: this.tokens.generate('refresh'),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
    return { tokens, accessExpiresAt, refreshExpiresAt };
  }
}

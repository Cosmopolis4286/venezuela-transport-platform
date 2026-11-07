import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../src/database/database.service.js';
import { auditEvents } from '../src/modules/audit/audit.schema.js';
import { otpChallenges, sessions, users } from '../src/modules/identity/identity.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { applicationDocuments, applications } from '../src/modules/onboarding/onboarding.schema.js';
import { ERASED, RetentionService } from '../src/modules/retention/retention.service.js';
import { FILE_STORAGE, type FileStorage } from '../src/storage/file-storage.js';

const expectDatabase = process.env.E2E_EXPECT_DATABASE === 'true';
const DAY = 24 * 3_600_000;

describe.runIf(expectDatabase)('Retention purge (e2e)', () => {
  let app: INestApplication;
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('deletes expired logs and erases old KYC data, keeping what is still in its period', async () => {
    const db = app.get(DatabaseService).db;
    const storage = app.get<FileStorage>(FILE_STORAGE);
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY);

    const [active, deleted] = await db
      .insert(users)
      .values([
        { email: `retention-active-${run}@example.test` },
        { status: 'deleted', deletedAt: ago(6 * 365) },
      ])
      .returning({ id: users.id });

    const otp = await db
      .insert(otpChallenges)
      .values(
        [400, 10].map((days) => ({
          channel: 'email' as const,
          destination: `retention-${run}@example.test`,
          purpose: 'login' as const,
          codeHash: `hash-${run}-${days}`,
          expiresAt: ago(days),
          createdAt: ago(days),
        })),
      )
      .returning({ id: otpChallenges.id });
    const sent = await db
      .insert(notifications)
      .values(
        [400, 10].map((days) => ({
          userId: active!.id,
          kind: 'payment_confirmed' as const,
          channel: 'email' as const,
          status: 'sent' as const,
          createdAt: ago(days),
        })),
      )
      .returning({ id: notifications.id });
    const audit = await db
      .insert(auditEvents)
      .values([800, 300].map((days) => ({ action: `retention.test.${run}`, createdAt: ago(days) })))
      .returning({ id: auditEvents.id });
    const session = (name: string, extra: Partial<typeof sessions.$inferInsert>) => ({
      userId: active!.id,
      client: 'web' as const,
      accessTokenHash: `a-${name}-${run}`,
      refreshTokenHash: `r-${name}-${run}`,
      accessExpiresAt: ago(0),
      refreshExpiresAt: new Date(now.getTime() + 30 * DAY),
      ...extra,
    });
    const sessionRows = await db
      .insert(sessions)
      .values([
        session('revoked-long-ago', { revokedAt: ago(60) }),
        session('expired-long-ago', { refreshExpiresAt: ago(45) }),
        session('revoked-recently', { revokedAt: ago(5) }),
        session('live', {}),
      ])
      .returning({ id: sessions.id });

    const application = (
      userId: string,
      status: 'rejected' | 'approved',
      reviewedDays: number,
    ) => ({
      userId,
      status,
      desiredRole: 'driver' as const,
      firstName: 'Ana',
      lastName: `Retención ${run}`,
      documentType: 'V' as const,
      documentNumber: `${run}-${status}-${reviewedDays}`,
      birthDate: '1990-01-01',
      city: 'Mérida',
      reviewedAt: ago(reviewedDays),
    });
    const [oldRejected, recentRejected, deletedUser, workingDriver] = await db
      .insert(applications)
      .values([
        application(active!.id, 'rejected', 6 * 365),
        application(active!.id, 'rejected', 365),
        application(deleted!.id, 'approved', 6 * 365),
        application(active!.id, 'approved', 6 * 365),
      ])
      .returning({ id: applications.id });
    const keys: string[] = [];
    for (const target of [oldRejected!, recentRejected!, deletedUser!]) {
      const key = `kyc/retention-${run}/${target.id}.pdf`;
      keys.push(key);
      await storage.put(key, Buffer.from('%PDF-1.4 test'), 'application/pdf');
      await db.insert(applicationDocuments).values({
        applicationId: target.id,
        kind: 'identity_document',
        storageKey: key,
        fileName: 'cedula.pdf',
        contentType: 'application/pdf',
        sizeBytes: 13,
        sha256: 'x'.repeat(64),
      });
    }

    const result = await app.get(RetentionService).sweep(now);
    expect(result.files).toBeGreaterThanOrEqual(2);
    expect(result.applications).toBeGreaterThanOrEqual(2);

    const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id);
    const remaining = {
      otp: () =>
        db
          .select({ id: otpChallenges.id })
          .from(otpChallenges)
          .where(inArray(otpChallenges.id, idsOf(otp))),
      sent: () =>
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(inArray(notifications.id, idsOf(sent))),
      audit: () =>
        db
          .select({ id: auditEvents.id })
          .from(auditEvents)
          .where(inArray(auditEvents.id, idsOf(audit))),
      sessions: () =>
        db
          .select({ id: sessions.id })
          .from(sessions)
          .where(inArray(sessions.id, idsOf(sessionRows))),
    };
    expect(idsOf(await remaining.otp())).toEqual([otp[1]!.id]);
    expect(idsOf(await remaining.sent())).toEqual([sent[1]!.id]);
    expect(idsOf(await remaining.audit())).toEqual([audit[1]!.id]);
    expect(idsOf(await remaining.sessions()).sort()).toEqual(
      [sessionRows[2]!.id, sessionRows[3]!.id].sort(),
    );

    const byId = async (id: string) =>
      (await db.select().from(applications).where(eq(applications.id, id)))[0]!;
    const documentsOf = async (id: string) =>
      db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, id));
    for (const erased of [oldRejected!, deletedUser!]) {
      const row = await byId(erased.id);
      expect(row).toMatchObject({ firstName: ERASED, documentNumber: ERASED, city: null });
      expect(await documentsOf(erased.id)).toHaveLength(0);
    }
    await expect(storage.read(keys[0]!).then((s) => s.toArray())).rejects.toThrow();
    // Still within its period, or the person still works: untouched.
    expect((await byId(recentRejected!.id)).documentNumber).not.toBe(ERASED);
    expect(await documentsOf(recentRejected!.id)).toHaveLength(1);
    expect((await byId(workingDriver!.id)).documentNumber).not.toBe(ERASED);

    // A second sweep finds nothing new among these rows.
    const again = await app.get(RetentionService).sweep(now);
    expect(again.files).toBe(0);
    await storage.delete(keys[1]!);
  });
});

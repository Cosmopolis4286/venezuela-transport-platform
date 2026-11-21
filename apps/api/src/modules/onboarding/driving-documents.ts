import { DRIVING_DOCUMENT_KINDS, todayInVenezuela } from '@vtp/shared-types';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { Database } from '../../database/database.service.js';
import { applicationDocuments, applications } from './onboarding.schema.js';

/**
 * Whether the driver's licence or medical certificate, in an approved application, expired
 * (ADR-042). Drivers who joined a line by invitation have no application and are not checked.
 */
export async function drivingDocumentsExpired(db: Database, userId: string): Promise<boolean> {
  const [expired] = await db
    .select({ id: applicationDocuments.id })
    .from(applicationDocuments)
    .innerJoin(applications, eq(applications.id, applicationDocuments.applicationId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.status, 'approved'),
        inArray(applicationDocuments.kind, [...DRIVING_DOCUMENT_KINDS]),
        isNotNull(applicationDocuments.expiresOn),
        lt(applicationDocuments.expiresOn, todayInVenezuela()),
      ),
    )
    .limit(1);
  return !!expired;
}

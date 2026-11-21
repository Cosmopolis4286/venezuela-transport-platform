import type { INestApplication } from '@nestjs/common';
import { todayInVenezuela } from '@vtp/shared-types';
import { DatabaseService } from '../../src/database/database.service.js';
import { bcvRates } from '../../src/modules/fiscal/fiscal.schema.js';

/**
 * The BCV's official rate (ADR-046) is one for the whole platform, and the e2e files run in
 * parallel against one database: every file uses this same rate for today, so none changes
 * another's bolívar amounts.
 */
export const OFFICIAL_RATE = '36.500000';

export async function setOfficialRate(app: INestApplication): Promise<void> {
  const date = todayInVenezuela();
  await app
    .get(DatabaseService)
    .db.insert(bcvRates)
    .values({ date, unitsPerUsd: OFFICIAL_RATE, source: 'manual' })
    .onConflictDoUpdate({
      target: bcvRates.date,
      set: { unitsPerUsd: OFFICIAL_RATE, source: 'manual', updatedAt: new Date() },
    });
}

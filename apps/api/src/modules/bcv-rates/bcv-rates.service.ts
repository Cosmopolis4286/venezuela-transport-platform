import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  BCV_RATE_MAX_AGE_DAYS,
  todayInVenezuela,
  type BcvRate,
  type BcvSyncResult,
} from '@vtp/shared-types';
import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { bcvRates } from '../fiscal/fiscal.schema.js';
import { BCV_RATE_FETCHERS, type BcvRateFetcher } from './bcv-sources.js';

const DAY_MS = 86_400_000;
/** The BCV publishes in the afternoon the rate of the next business day (up to 4 days ahead). */
const MAX_DAYS_AHEAD = 4;

const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

type BcvRateRow = typeof bcvRates.$inferSelect;
const toRate = (row: BcvRateRow): BcvRate => ({
  date: row.date,
  unitsPerUsd: row.unitsPerUsd,
  source: row.source,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * The BCV's official bolívar rate (ADR-046). A job fetches it every `BCV_RATE_SYNC_HOURS` (6 by
 * default) from the BCV's website, or from DolarApi when the website fails, and saves it by its
 * "fecha valor". Bolívar prices of bookings and trip packs use the rate in force; staff can type
 * one when both sources fail, and a typed rate is never overwritten by the job.
 */
@Injectable()
export class BcvRatesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BcvRatesService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    @Inject(BCV_RATE_FETCHERS) private readonly fetchers: BcvRateFetcher[],
  ) {}

  onApplicationBootstrap(): void {
    const hours = this.config.get('BCV_RATE_SYNC_HOURS');
    // Tests call sync() themselves, with fake sources.
    if (!hours || this.config.get('NODE_ENV') === 'test') return;
    const run = () => {
      this.sync().catch((error: unknown) =>
        this.logger.error(`BCV rate sync failed: ${(error as Error).message}`),
      );
    };
    const first = setTimeout(run, 10_000);
    const every = setInterval(run, hours * 3_600_000);
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  /**
   * The rate in force today: the newest one whose "fecha valor" has arrived, if it is at most
   * `BCV_RATE_MAX_AGE_DAYS` old. Null otherwise: then nothing is charged in bolívares.
   */
  async current(now = new Date()): Promise<BcvRate | null> {
    const today = todayInVenezuela(now);
    const [row] = await this.database.db
      .select()
      .from(bcvRates)
      .where(
        and(lte(bcvRates.date, today), gte(bcvRates.date, shiftDay(today, -BCV_RATE_MAX_AGE_DAYS))),
      )
      .orderBy(desc(bcvRates.date))
      .limit(1);
    return row ? toRate(row) : null;
  }

  async list(limit = 60): Promise<BcvRate[]> {
    const rows = await this.database.db
      .select()
      .from(bcvRates)
      .orderBy(desc(bcvRates.date))
      .limit(limit);
    return rows.map(toRate);
  }

  /** Fetches the rate now: the first source that answers wins. */
  async sync(now = new Date()): Promise<BcvSyncResult> {
    const errors: string[] = [];
    const latest = shiftDay(todayInVenezuela(now), MAX_DAYS_AHEAD);
    for (const fetcher of this.fetchers) {
      try {
        const fetched = await fetcher.fetch();
        if (fetched.date > latest) throw new Error(`date ${fetched.date} is too far ahead`);
        const [row] = await this.database.db
          .insert(bcvRates)
          .values({ date: fetched.date, unitsPerUsd: fetched.unitsPerUsd, source: fetcher.source })
          .onConflictDoUpdate({
            target: bcvRates.date,
            set: {
              unitsPerUsd: fetched.unitsPerUsd,
              source: fetcher.source,
              updatedAt: new Date(),
            },
            // A rate typed by staff stays as typed.
            setWhere: ne(bcvRates.source, 'manual'),
          })
          .returning();
        const saved =
          row ??
          (
            await this.database.db.select().from(bcvRates).where(eq(bcvRates.date, fetched.date))
          )[0]!;
        this.logger.log(
          `BCV rate ${saved.unitsPerUsd} Bs/USD for ${saved.date} (source: ${saved.source})`,
        );
        return { ok: true, rate: toRate(saved), errors };
      } catch (error) {
        errors.push(`${fetcher.source}: ${(error as Error).message}`);
      }
    }
    this.logger.error(`No source gave the BCV rate: ${errors.join('; ')}`);
    return { ok: false, rate: null, errors };
  }
}

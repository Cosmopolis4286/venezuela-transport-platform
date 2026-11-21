import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { BcvRatesService } from './bcv-rates.service.js';
import { BcvSyncController, OfficialRateController } from './bcv-rates.controller.js';
import { BCV_RATE_FETCHERS, BcvWebsiteFetcher, DolarApiFetcher } from './bcv-sources.js';

/** The BCV's official rate, fetched automatically (ADR-046). */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [OfficialRateController, BcvSyncController],
  providers: [
    BcvRatesService,
    // In order: the official website first, DolarApi when it fails.
    { provide: BCV_RATE_FETCHERS, useValue: [new BcvWebsiteFetcher(), new DolarApiFetcher()] },
  ],
  exports: [BcvRatesService],
})
export class BcvRatesModule {}

import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BcvRate, BcvSyncResult } from '@vtp/shared-types';
import { Public } from '../identity/auth.decorators.js';
import { RequirePlatformPermission } from '../identity/platform-role.guard.js';
import { BcvRatesService } from './bcv-rates.service.js';

/** The BCV rate in force (public): bolívar prices are worked out with it (ADR-046). */
@ApiTags('payments')
@Controller({ path: 'exchange-rates/official', version: '1' })
export class OfficialRateController {
  constructor(private readonly rates: BcvRatesService) {}

  @Public()
  @Get()
  async current(): Promise<{ rate: BcvRate | null }> {
    return { rate: await this.rates.current() };
  }
}

/** Staff fetch the BCV rate now instead of waiting for the job. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('finance.manage')
@Controller({ path: 'admin/fiscal/bcv-rates/sync', version: '1' })
export class BcvSyncController {
  constructor(private readonly rates: BcvRatesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  sync(): Promise<BcvSyncResult> {
    return this.rates.sync();
  }
}

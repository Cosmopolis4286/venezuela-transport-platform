import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CashSale, CashSalesDay } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { CashSalesDayQueryDto, CreateCashSaleDto, VoidCashSaleDto } from './cash-sales.dto.js';
import { CashSalesService } from './cash-sales.service.js';

/** Drivers record the passengers who paid them in cash (ADR-033). */
@ApiTags('cash-sales')
@ApiBearerAuth()
@RequireOrganizationAccess('trips.drive')
@Controller({ path: 'organizations/:organizationId/cash-sales', version: '1' })
export class CashSalesController {
  constructor(private readonly cashSales: CashSalesService) {}

  @Post()
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: CreateCashSaleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<CashSale> {
    return this.cashSales.create(access, body, auth, meta);
  }

  @Get('mine')
  mine(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: CashSalesDayQueryDto,
    @CurrentAuth() auth: Authenticated,
  ): Promise<CashSalesDay> {
    return this.cashSales.mine(access, auth, query.date);
  }

  @Post(':saleId/void')
  @HttpCode(HttpStatus.OK)
  void(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() body: VoidCashSaleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<CashSale> {
    return this.cashSales.void(access, saleId, body.reason, auth, meta);
  }
}

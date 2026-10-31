import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  AdminSettlementSummary,
  OrganizationSettlement,
  Payout,
  RefundDuePayment,
  SettlementEntry,
  SettlementPolicy,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  CreatePayoutDto,
  MarkRefundedDto,
  SetOrganizationPolicyDto,
  SettlementEntriesQueryDto,
  SettlementPolicyDto,
  VoidPayoutDto,
} from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

/** An operator's balance with the platform, its paid bookings and the payouts it received. */
@ApiTags('settlements')
@ApiBearerAuth()
@RequireOrganizationAccess('finance.view')
@Controller({ path: 'organizations/:organizationId', version: '1' })
export class OrganizationSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('settlement')
  settlement(@CurrentOrganization() access: OrganizationAccess): Promise<OrganizationSettlement> {
    return this.settlements.settlement(access.organization.id);
  }

  @Get('settlement/entries')
  entries(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: SettlementEntriesQueryDto,
  ): Promise<SettlementEntry[]> {
    return this.settlements.entries(access.organization.id, query.month);
  }

  @Get('payouts')
  payouts(@CurrentOrganization() access: OrganizationAccess): Promise<Payout[]> {
    return this.settlements.payouts(access.organization.id);
  }
}

/** Platform admins: commissions, payouts to operators and refunds to payers. Money: admins only. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin', version: '1' })
export class AdminSettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('settlements')
  list(): Promise<AdminSettlementSummary[]> {
    return this.settlements.adminSummaries();
  }

  @Get('organizations/:organizationId/settlement')
  settlement(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<AdminSettlementSummary> {
    return this.settlements.adminSummary(organizationId);
  }

  @Get('organizations/:organizationId/settlement/entries')
  entries(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: SettlementEntriesQueryDto,
  ): Promise<SettlementEntry[]> {
    return this.settlements.entries(organizationId, query.month);
  }

  @Get('organizations/:organizationId/payouts')
  payouts(@Param('organizationId', ParseUUIDPipe) organizationId: string): Promise<Payout[]> {
    return this.settlements.payouts(organizationId);
  }

  @Get('settlement-policy')
  platformPolicy(): Promise<SettlementPolicy> {
    return this.settlements.platformPolicy();
  }

  @Put('settlement-policy')
  setPlatformPolicy(
    @Body() body: SettlementPolicyDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<SettlementPolicy> {
    return this.settlements.setPlatformPolicy(body, auth, meta);
  }

  @Put('organizations/:organizationId/policy')
  setOrganizationPolicy(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: SetOrganizationPolicyDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OrganizationSettlement> {
    return this.settlements.setOrganizationPolicy(organizationId, body, auth, meta);
  }

  @Post('organizations/:organizationId/payouts')
  createPayout(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: CreatePayoutDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payout> {
    return this.settlements.createPayout(organizationId, body, auth, meta);
  }

  @Post('payouts/:payoutId/void')
  @HttpCode(HttpStatus.OK)
  voidPayout(
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() body: VoidPayoutDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payout> {
    return this.settlements.voidPayout(payoutId, body.reason, auth, meta);
  }

  @Get('refunds')
  refunds(): Promise<RefundDuePayment[]> {
    return this.settlements.refundsDue();
  }

  @Post('refunds/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRefunded(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: MarkRefundedDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.settlements.markRefunded(paymentId, body.reference, auth, meta);
  }
}

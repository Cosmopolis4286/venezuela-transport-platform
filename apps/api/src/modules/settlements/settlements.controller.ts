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
  DriverDebt,
  DriverDebtReport,
  DriverDebtReportForReview,
  DriverEarnings,
  DriverPayoutAccount,
  DriverPayoutRun,
  IndependentCommission,
  OrganizationSettlement,
  Payout,
  PendingDriverPayout,
  RefundDuePayment,
  SettlementEntry,
  SettlementPolicy,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformPermission } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  CreatePayoutDto,
  DriverPayoutAccountDto,
  MarkPayoutSentDto,
  RejectDebtReportDto,
  ReportDebtPaymentDto,
  MarkRefundedDto,
  SetIndependentCommissionDto,
  SetOrganizationPolicyDto,
  SettlementEntriesQueryDto,
  SettlementPolicyDto,
  VoidPayoutDto,
} from './settlements.dto.js';
import { DebtPaymentsService } from './debt-payments.service.js';
import { IndependentPayoutsService } from './independent-payouts.service.js';
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
@RequirePlatformPermission('finance.manage')
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
    return this.settlements.refundsDue(null);
  }

  @Post('refunds/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRefunded(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: MarkRefundedDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.settlements.markRefunded(paymentId, null, body.reference, auth, meta);
  }
}

/** An operator that collects its own payments sends their refunds itself (ADR-027). */
@ApiTags('settlements')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/refunds', version: '1' })
export class OrganizationRefundsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @RequireOrganizationAccess('finance.manage')
  refunds(@CurrentOrganization() access: OrganizationAccess): Promise<RefundDuePayment[]> {
    return this.settlements.refundsDue(access.organization.id);
  }

  @Post(':paymentId')
  @RequireOrganizationAccess('finance.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRefunded(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: MarkRefundedDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.settlements.markRefunded(
      paymentId,
      access.organization.id,
      body.reference,
      auth,
      meta,
    );
  }
}

/** A driver's earnings on routes paid to drivers, and where to pay them (ADR-030). */
@ApiTags('settlements')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class DriverEarningsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('earnings')
  earnings(@CurrentAuth() auth: Authenticated): Promise<DriverEarnings> {
    return this.settlements.driverEarnings(auth.user.id);
  }

  @Put('payout-account')
  setPayoutAccount(
    @Body() body: DriverPayoutAccountDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverPayoutAccount> {
    return this.settlements.setPayoutAccount(auth.user.id, body, meta);
  }
}

/** Independent drivers' commission and weekly payouts (ADR-045). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('finance.manage')
@Controller({ path: 'admin', version: '1' })
export class AdminIndependentPayoutsController {
  constructor(private readonly payouts: IndependentPayoutsService) {}

  @Get('independent-commission')
  commission(): Promise<IndependentCommission> {
    return this.payouts.commission();
  }

  @Put('independent-commission')
  setCommission(
    @CurrentAuth() auth: Authenticated,
    @Body() body: SetIndependentCommissionDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<IndependentCommission> {
    return this.payouts.setCommission(auth, body.rate, meta);
  }

  @Get('driver-payouts/pending')
  pending(): Promise<PendingDriverPayout[]> {
    return this.payouts.pending();
  }

  /** Runs this week's payouts now (they also run by themselves on Monday mornings). */
  @Post('driver-payouts/run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<DriverPayoutRun> {
    return this.payouts.run();
  }

  @Post('payouts/:payoutId/sent')
  @HttpCode(HttpStatus.OK)
  sent(
    @CurrentAuth() auth: Authenticated,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
    @Body() body: MarkPayoutSentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payout> {
    return this.payouts.markSent(auth, payoutId, body.reference, meta);
  }
}

/** Independent drivers pay their commission debt and report it (ADR-046). */
@ApiTags('settlements')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class DriverDebtsController {
  constructor(private readonly debts: DebtPaymentsService) {}

  @Get('debts')
  list(@CurrentAuth() auth: Authenticated): Promise<DriverDebt[]> {
    return this.debts.debts(auth.user.id);
  }

  @Post('debt-payments')
  @HttpCode(HttpStatus.OK)
  report(
    @CurrentAuth() auth: Authenticated,
    @Body() body: ReportDebtPaymentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverDebt[]> {
    return this.debts.report(auth, body, meta);
  }
}

/** Finance: commission payments drivers reported (ADR-046). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('finance.manage')
@Controller({ path: 'admin/driver-debt-reports', version: '1' })
export class AdminDebtReportsController {
  constructor(private readonly debts: DebtPaymentsService) {}

  @Get()
  list(): Promise<DriverDebtReportForReview[]> {
    return this.debts.waiting();
  }

  @Post(':reportId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentAuth() auth: Authenticated,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverDebtReport> {
    return this.debts.confirm(auth, reportId, meta);
  }

  @Post(':reportId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentAuth() auth: Authenticated,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: RejectDebtReportDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverDebtReport> {
    return this.debts.reject(auth, reportId, body.reason, meta);
  }
}

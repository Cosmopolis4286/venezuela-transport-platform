import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PAYMENT_METHODS, type PaymentMethod } from '@vtp/shared-types';
import type {
  Booking,
  ExchangeRate,
  Payment,
  PaymentAccount,
  PaymentOption,
  PaymentReview,
} from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  ConfirmPaymentDto,
  CreatePaymentDto,
  PaymentAccountDto,
  PaymentMethodParamDto,
  RejectPaymentDto,
  ReplaceExchangeRatesDto,
  ReportPaymentDto,
  SimulatePaymentDto,
} from './payments.dto.js';
import { PaymentsService } from './payments.service.js';

/** `:method` alone (a DTO for `@Param()` would also receive `:organizationId` and reject it). */
const methodPipe = new ParseEnumPipe(Object.fromEntries(PAYMENT_METHODS.map((m) => [m, m])));

/** Passengers pay their held bookings. */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MyPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('bookings/:bookingId/payment-options')
  options(
    @CurrentAuth() auth: Authenticated,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<PaymentOption[]> {
    return this.payments.options(auth, bookingId);
  }

  @Post('bookings/:bookingId/payments')
  create(
    @CurrentAuth() auth: Authenticated,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: CreatePaymentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payment> {
    return this.payments.create(auth, bookingId, body.method, meta);
  }

  /** Manual payments: "I paid", with the operation number; staff verify it. */
  @Post('payments/:paymentId/report')
  @HttpCode(HttpStatus.OK)
  report(
    @CurrentAuth() auth: Authenticated,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ReportPaymentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Booking> {
    return this.payments.report(auth, paymentId, body.operationNumber, meta);
  }

  /** Only with `PAYMENT_PROVIDER=simulated` (never in production): pretends the money arrived. */
  @Post('payments/:paymentId/simulate')
  @HttpCode(HttpStatus.OK)
  simulate(
    @CurrentAuth() auth: Authenticated,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: SimulatePaymentDto,
  ): Promise<Booking> {
    if (!this.payments.simulatorEnabled) {
      throw new ApiException('NOT_FOUND', 'Payment not found', HttpStatus.NOT_FOUND);
    }
    return this.payments.simulate(auth, paymentId, body.amount);
  }
}

/** Each operator sets the rates its fares are converted with. */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/exchange-rates', version: '1' })
export class ExchangeRatesController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequireOrganizationAccess()
  list(@CurrentOrganization() access: OrganizationAccess): Promise<ExchangeRate[]> {
    return this.payments.rates(access.organization.id);
  }

  @Put()
  @RequireOrganizationAccess('routes.manage')
  replace(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: ReplaceExchangeRatesDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ExchangeRate[]> {
    return this.payments.replaceRates(access, body, auth, meta);
  }
}

/** Platform admins: receiving accounts and verification of reported payments (ADR-027). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin', version: '1' })
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payment-accounts')
  accounts(): Promise<PaymentAccount[]> {
    return this.payments.accounts(null);
  }

  @Put('payment-accounts/:method')
  setAccount(
    @Param() params: PaymentMethodParamDto,
    @Body() body: PaymentAccountDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<PaymentAccount> {
    return this.payments.setAccount(null, params.method, body, auth, meta);
  }

  @Delete('payment-accounts/:method')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAccount(
    @Param() params: PaymentMethodParamDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.payments.removeAccount(null, params.method, auth, meta);
  }

  @Get('payments/review')
  review(): Promise<PaymentReview[]> {
    return this.payments.reviewQueue(null);
  }

  @Post('payments/:paymentId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ConfirmPaymentDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payment> {
    return this.payments.confirmReported(paymentId, null, body.receivedAmount, auth, meta);
  }

  @Post('payments/:paymentId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: RejectPaymentDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payment> {
    return this.payments.rejectReported(paymentId, null, body.reason, auth, meta);
  }
}

/**
 * An operator that collects its own payments (ADR-027): its receiving accounts and the
 * verification of what its passengers report. Refunds: `OrganizationRefundsController`.
 */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId', version: '1' })
export class OrganizationPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payment-accounts')
  @RequireOrganizationAccess('finance.view')
  accounts(@CurrentOrganization() access: OrganizationAccess): Promise<PaymentAccount[]> {
    return this.payments.accounts(access.organization.id);
  }

  @Put('payment-accounts/:method')
  @RequireOrganizationAccess('finance.manage')
  setAccount(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('method', methodPipe) method: PaymentMethod,
    @Body() body: PaymentAccountDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<PaymentAccount> {
    return this.payments.setAccount(access.organization.id, method, body, auth, meta);
  }

  @Delete('payment-accounts/:method')
  @RequireOrganizationAccess('finance.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAccount(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('method', methodPipe) method: PaymentMethod,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.payments.removeAccount(access.organization.id, method, auth, meta);
  }

  @Get('payments/review')
  @RequireOrganizationAccess('finance.manage')
  review(@CurrentOrganization() access: OrganizationAccess): Promise<PaymentReview[]> {
    return this.payments.reviewQueue(access.organization.id);
  }

  @Post('payments/:paymentId/confirm')
  @RequireOrganizationAccess('finance.manage')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ConfirmPaymentDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payment> {
    return this.payments.confirmReported(
      paymentId,
      access.organization.id,
      body.receivedAmount,
      auth,
      meta,
    );
  }

  @Post('payments/:paymentId/reject')
  @RequireOrganizationAccess('finance.manage')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: RejectPaymentDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Payment> {
    return this.payments.rejectReported(paymentId, access.organization.id, body.reason, auth, meta);
  }
}

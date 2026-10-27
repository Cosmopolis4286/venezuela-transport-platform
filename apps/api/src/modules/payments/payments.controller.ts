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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Booking, ExchangeRate, Payment, PaymentOption } from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { CreatePaymentDto, ReplaceExchangeRatesDto, SimulatePaymentDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';

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

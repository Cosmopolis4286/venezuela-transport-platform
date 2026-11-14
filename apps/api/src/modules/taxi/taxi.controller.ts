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
  AssistedTaxiRide,
  PublicTaxiRide,
  OnDemandFare,
  StretchOption,
  DriverTaxiBoard,
  OperatorTaxiRide,
  PendingRideFee,
  StopSummary,
  TaxiDispatchBoard,
  TaxiRide,
  TaxiTerminal,
} from '@vtp/shared-types';
import { AuthThrottle, CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  AcceptTaxiRideDto,
  AssistedTaxiDto,
  RateTaxiRideDto,
  CompleteTaxiRideDto,
  PickUpTaxiRideDto,
  AssignTaxiRideDto,
  ReplaceTaxiTerminalsDto,
  RequestTaxiDto,
  ReplaceOnDemandFaresDto,
  StretchOptionsQueryDto,
} from './taxi.dto.js';
import { TaxiService } from './taxi.service.js';

/** Passengers ask for a taxi at a terminal and follow it. */
@ApiTags('taxi')
@Controller({ version: '1' })
export class TaxiController {
  constructor(private readonly taxi: TaxiService) {}

  /** Public: per vehicle, the lines that ride a stretch on demand and their fares. */
  @Public()
  @Get('taxi/stretch-options')
  stretchOptions(@Query() query: StretchOptionsQueryDto): Promise<StretchOption[]> {
    return this.taxi.stretchOptions(query.from, query.to);
  }

  @Public()
  @Get('taxi/terminals')
  terminals(): Promise<TaxiTerminal[]> {
    return this.taxi.terminals();
  }

  @ApiBearerAuth()
  @Post('me/taxi-rides')
  request(
    @CurrentAuth() auth: Authenticated,
    @Body() body: RequestTaxiDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TaxiRide> {
    return this.taxi.request(auth, body, meta);
  }

  @ApiBearerAuth()
  @Get('me/taxi-rides')
  mine(@CurrentAuth() auth: Authenticated): Promise<TaxiRide[]> {
    return this.taxi.listMine(auth.user.id);
  }

  /** Late-cancellation fees still owed: the next driver collects them with the fare. */
  @ApiBearerAuth()
  @Get('me/taxi-fees')
  fees(@CurrentAuth() auth: Authenticated): Promise<PendingRideFee[]> {
    return this.taxi.pendingFees(auth.user.id);
  }

  @ApiBearerAuth()
  @Get('me/taxi-rides/:rideId')
  one(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ): Promise<TaxiRide> {
    return this.taxi.getMine(auth.user.id, rideId);
  }

  @ApiBearerAuth()
  @Post('me/taxi-rides/:rideId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TaxiRide> {
    return this.taxi.cancelMine(auth, rideId, meta);
  }

  @ApiBearerAuth()
  @Post('me/taxi-rides/:rideId/rate')
  @HttpCode(HttpStatus.OK)
  rate(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: RateTaxiRideDto,
  ): Promise<TaxiRide> {
    return this.taxi.rateMine(auth.user.id, rideId, body);
  }
}

/** Platform staff ask for taxis for people who write on WhatsApp (ADR-037). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('reviewer')
@Controller({ path: 'admin/taxi-rides', version: '1' })
export class AdminTaxiController {
  constructor(private readonly taxi: TaxiService) {}

  @Post()
  request(
    @Body() body: AssistedTaxiDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AssistedTaxiRide> {
    return this.taxi.assistedRequest(auth, body, meta);
  }

  @Get()
  list(): Promise<AssistedTaxiRide[]> {
    return this.taxi.assistedList();
  }
}

/** The tracking link sent on WhatsApp: no account, the token is the secret. */
@ApiTags('taxi')
@Controller({ path: 'taxi/track/:token', version: '1' })
export class TaxiTrackingController {
  constructor(private readonly taxi: TaxiService) {}

  // Only the global rate limit: the page refreshes itself every 15 s while the ride is open, and
  // the token (144 random bits) cannot be guessed. Cancel and rate get the stricter one.
  @Public()
  @Get()
  view(@Param('token') token: string): Promise<PublicTaxiRide> {
    return this.taxi.tracking(token);
  }

  @Public()
  @AuthThrottle()
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('token') token: string, @ReqMeta() meta: RequestMeta): Promise<PublicTaxiRide> {
    return this.taxi.trackingCancel(token, meta);
  }

  @Public()
  @AuthThrottle()
  @Post('rate')
  @HttpCode(HttpStatus.OK)
  rate(@Param('token') token: string, @Body() body: RateTaxiRideDto): Promise<PublicTaxiRide> {
    return this.taxi.trackingRate(token, body);
  }
}

/** Taxi drivers: open requests at their lines' terminals and the ride they are on. */
@ApiTags('taxi')
@ApiBearerAuth()
@Controller({ path: 'me/taxi', version: '1' })
export class TaxiDriverController {
  constructor(private readonly taxi: TaxiService) {}

  @Get()
  board(@CurrentAuth() auth: Authenticated): Promise<DriverTaxiBoard> {
    return this.taxi.driverBoard(auth.user.id);
  }

  @Post('rides/:rideId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: AcceptTaxiRideDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide> {
    return this.taxi.accept(auth, rideId, body, meta);
  }

  @Post('rides/:rideId/pickup')
  @HttpCode(HttpStatus.OK)
  pickup(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: PickUpTaxiRideDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide | null> {
    return this.taxi.driverStep(auth, rideId, 'pickup', meta, { pickupCode: body.pickupCode });
  }

  @Post('rides/:rideId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: CompleteTaxiRideDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide | null> {
    return this.taxi.driverStep(auth, rideId, 'complete', meta, {
      feesCollected: body.feesCollected,
    });
  }

  @Post('rides/:rideId/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.taxi.driverStep(auth, rideId, 'release', meta);
  }
}

/** Taxi lines: the terminals they serve, and their dispatchers' board. */
@ApiTags('taxi')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/taxi', version: '1' })
export class TaxiLineController {
  constructor(private readonly taxi: TaxiService) {}

  /** Taxi and motorcycle taxi lines: fixed fares to ride stretches on demand (ADR-028). */
  @Get('stretch-fares')
  @RequireOrganizationAccess()
  stretchFares(@CurrentOrganization() access: OrganizationAccess): Promise<OnDemandFare[]> {
    return this.taxi.faresOf(access);
  }

  @Put('stretch-fares')
  @RequireOrganizationAccess('routes.manage')
  replaceStretchFares(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: ReplaceOnDemandFaresDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OnDemandFare[]> {
    return this.taxi.replaceFares(access, body, auth, meta);
  }

  @Get('terminals')
  @RequireOrganizationAccess()
  terminals(@CurrentOrganization() access: OrganizationAccess): Promise<StopSummary[]> {
    return this.taxi.terminalsOf(access);
  }

  @Put('terminals')
  @RequireOrganizationAccess('routes.manage')
  replaceTerminals(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: ReplaceTaxiTerminalsDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<StopSummary[]> {
    return this.taxi.replaceTerminals(access, body.stopIds, auth, meta);
  }

  @Get()
  @RequireOrganizationAccess('operations.dispatch')
  board(@CurrentOrganization() access: OrganizationAccess): Promise<TaxiDispatchBoard> {
    return this.taxi.dispatchBoard(access);
  }

  @Post('rides/:rideId/assign')
  @HttpCode(HttpStatus.OK)
  @RequireOrganizationAccess('operations.dispatch')
  assign(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: AssignTaxiRideDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide> {
    return this.taxi.assign(access, rideId, body, auth, meta);
  }

  @Post('rides/:rideId/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrganizationAccess('operations.dispatch')
  release(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.taxi.release(access, rideId, auth, meta);
  }
}

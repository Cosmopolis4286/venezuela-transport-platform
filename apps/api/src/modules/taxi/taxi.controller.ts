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
import type {
  DriverTaxiBoard,
  OperatorTaxiRide,
  StopSummary,
  TaxiDispatchBoard,
  TaxiRide,
  TaxiTerminal,
} from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  AcceptTaxiRideDto,
  AssignTaxiRideDto,
  ReplaceTaxiTerminalsDto,
  RequestTaxiDto,
} from './taxi.dto.js';
import { TaxiService } from './taxi.service.js';

/** Passengers ask for a taxi at a terminal and follow it. */
@ApiTags('taxi')
@Controller({ version: '1' })
export class TaxiController {
  constructor(private readonly taxi: TaxiService) {}

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
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide | null> {
    return this.taxi.driverStep(auth, rideId, 'pickup', meta);
  }

  @Post('rides/:rideId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentAuth() auth: Authenticated,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatorTaxiRide | null> {
    return this.taxi.driverStep(auth, rideId, 'complete', meta);
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

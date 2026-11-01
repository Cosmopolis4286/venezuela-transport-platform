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
  DispatchBoard,
  DispatchDeparture,
  DriverManifest,
  DriverTrip,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { AssignTripDto, DispatchDateQueryDto } from './dispatch.dto.js';
import { DispatchService } from './dispatch.service.js';

/** Dispatchers assign a vehicle and a driver to each departure. */
@ApiTags('dispatch')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/dispatch', version: '1' })
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  @RequireOrganizationAccess('operations.dispatch')
  board(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: DispatchDateQueryDto,
  ): Promise<DispatchBoard> {
    return this.dispatch.board(access.organization.id, query.date);
  }

  @Put('assignment')
  @RequireOrganizationAccess('operations.dispatch')
  assign(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: AssignTripDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DispatchDeparture> {
    return this.dispatch.assign(access, body, auth, meta);
  }
}

/** Drivers: the trips assigned to them and who rides. */
@ApiTags('dispatch')
@ApiBearerAuth()
@Controller({ path: 'me/driving', version: '1' })
export class DriverController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  trips(@CurrentAuth() auth: Authenticated): Promise<DriverTrip[]> {
    return this.dispatch.driving(auth.user.id);
  }

  @Post(':tripId/depart')
  @HttpCode(HttpStatus.OK)
  depart(
    @CurrentAuth() auth: Authenticated,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverTrip> {
    return this.dispatch.markTrip(auth, tripId, 'depart', meta);
  }

  @Post(':tripId/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(
    @CurrentAuth() auth: Authenticated,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DriverTrip> {
    return this.dispatch.markTrip(auth, tripId, 'arrive', meta);
  }

  @Get(':tripId/passengers')
  passengers(
    @CurrentAuth() auth: Authenticated,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ): Promise<DriverManifest> {
    return this.dispatch.driverManifest(auth.user.id, tripId);
  }
}

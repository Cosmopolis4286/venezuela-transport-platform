import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FleetVehicle } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { UpdateVehicleDto, VehicleDto } from './fleet.dto.js';
import { VehiclesService } from './vehicles.service.js';

/** Buses and cars of an operator. Any member can read them; `fleet.manage` edits them. */
@ApiTags('fleet')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/vehicles', version: '1' })
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequireOrganizationAccess()
  list(@CurrentOrganization() access: OrganizationAccess): Promise<FleetVehicle[]> {
    return this.vehicles.list(access.organization.id);
  }

  @Post()
  @RequireOrganizationAccess('fleet.manage')
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: VehicleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FleetVehicle> {
    return this.vehicles.create(access, body, auth, meta);
  }

  @Patch(':vehicleId')
  @RequireOrganizationAccess('fleet.manage')
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() body: UpdateVehicleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FleetVehicle> {
    return this.vehicles.update(access, vehicleId, body, auth, meta);
  }
}

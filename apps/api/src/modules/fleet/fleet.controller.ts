import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SeatLayout } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import { SeatLayoutDto, UpdateSeatLayoutDto } from './fleet.dto.js';
import { FleetService } from './fleet.service.js';

/** Seat maps of the vehicles a bus company or taxi line runs. Any member can read them. */
@ApiTags('fleet')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/seat-layouts', version: '1' })
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  @RequireOrganizationAccess()
  list(@CurrentOrganization() access: OrganizationAccess): Promise<SeatLayout[]> {
    return this.fleet.list(access.organization.id);
  }

  @Post()
  @RequireOrganizationAccess('fleet.manage')
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: SeatLayoutDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<SeatLayout> {
    return this.fleet.create(access, body, auth, meta);
  }

  @Get(':layoutId')
  @RequireOrganizationAccess()
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
  ): Promise<SeatLayout> {
    return this.fleet.get(access, layoutId);
  }

  @Patch(':layoutId')
  @RequireOrganizationAccess('fleet.manage')
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
    @Body() body: UpdateSeatLayoutDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<SeatLayout> {
    return this.fleet.update(access, layoutId, body, auth, meta);
  }

  @Delete(':layoutId')
  @RequireOrganizationAccess('fleet.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.fleet.remove(access, layoutId, auth, meta);
  }
}

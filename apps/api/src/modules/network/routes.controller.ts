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
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Route, RouteSummary } from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  ReplaceFaresDto,
  RouteDto,
  RouteStatusDto,
  ScheduleDto,
  UpdateRouteDto,
  UpdateScheduleDto,
} from './network.dto.js';
import { RoutesService } from './routes.service.js';

/** Routes, fares and schedules of a bus company or taxi line. Any member can read them. */
@ApiTags('network')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/routes', version: '1' })
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @RequireOrganizationAccess()
  list(@CurrentOrganization() access: OrganizationAccess): Promise<RouteSummary[]> {
    return this.routes.list(access.organization.id);
  }

  @Post()
  @RequireOrganizationAccess('routes.manage')
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: RouteDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.create(access, body, auth, meta);
  }

  @Get(':routeId')
  @RequireOrganizationAccess()
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ): Promise<Route> {
    return this.routes.get(access, routeId);
  }

  @Patch(':routeId')
  @RequireOrganizationAccess('routes.manage')
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() body: UpdateRouteDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.update(access, routeId, body, auth, meta);
  }

  /** Drafts only. */
  @Delete(':routeId')
  @RequireOrganizationAccess('routes.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.routes.remove(access, routeId, auth, meta);
  }

  /** Publish (`active`) or withdraw (`inactive`). Publishing needs a schedule and the full fare. */
  @Post(':routeId/status')
  @RequireOrganizationAccess('routes.manage')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() body: RouteStatusDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.changeStatus(access, routeId, body.status, auth, meta);
  }

  @Put(':routeId/fares')
  @RequireOrganizationAccess('routes.manage')
  replaceFares(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() body: ReplaceFaresDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.replaceFares(access, routeId, body.fares, auth, meta);
  }

  @Post(':routeId/schedules')
  @RequireOrganizationAccess('routes.manage')
  addSchedule(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() body: ScheduleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.addSchedule(access, routeId, body, auth, meta);
  }

  @Patch(':routeId/schedules/:scheduleId')
  @RequireOrganizationAccess('routes.manage')
  updateSchedule(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() body: UpdateScheduleDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.updateSchedule(access, routeId, scheduleId, body, auth, meta);
  }

  @Delete(':routeId/schedules/:scheduleId')
  @RequireOrganizationAccess('routes.manage')
  removeSchedule(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Route> {
    return this.routes.removeSchedule(access, routeId, scheduleId, auth, meta);
  }
}

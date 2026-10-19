import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Stop } from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { StopDto, StopSearchQueryDto, UpdateStopDto } from './network.dto.js';
import { StopsService } from './stops.service.js';

/** Active terminals and stops, for the passenger search and route editors. */
@ApiTags('network')
@Controller({ path: 'stops', version: '1' })
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  @Public()
  @Get()
  search(@Query() query: StopSearchQueryDto): Promise<Stop[]> {
    return this.stops.search(query);
  }
}

/** Platform staff curate the stop catalog every operator builds routes on. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('reviewer')
@Controller({ path: 'admin/stops', version: '1' })
export class AdminStopsController {
  constructor(private readonly stops: StopsService) {}

  @Get()
  list(@Query() query: StopSearchQueryDto): Promise<Stop[]> {
    return this.stops.search({ ...query, includeInactive: true });
  }

  @Post()
  create(
    @Body() body: StopDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Stop> {
    return this.stops.create(body, auth, meta);
  }

  @Patch(':stopId')
  update(
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: UpdateStopDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Stop> {
    return this.stops.update(stopId, body, auth, meta);
  }
}

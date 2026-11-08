import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { OperatingZone } from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { OperatingZoneDto, UpdateOperatingZoneDto } from './network.dto.js';
import { ZonesService } from './zones.service.js';

/** Cities and regions where the platform sells (or will soon). */
@ApiTags('network')
@Controller({ path: 'zones', version: '1' })
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Public()
  @Get()
  list(): Promise<OperatingZone[]> {
    return this.zones.list();
  }
}

/** Only admins open, pause or reconfigure a zone: it decides where money is taken. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('admin')
@Controller({ path: 'admin/zones', version: '1' })
export class AdminZonesController {
  constructor(private readonly zones: ZonesService) {}

  // Reviewers curate stops and pick their zone.
  @RequirePlatformRole('reviewer')
  @Get()
  list(): Promise<OperatingZone[]> {
    return this.zones.list(true);
  }

  @Post()
  create(
    @Body() body: OperatingZoneDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatingZone> {
    return this.zones.create(body, auth, meta);
  }

  @Patch(':zoneId')
  update(
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() body: UpdateOperatingZoneDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatingZone> {
    return this.zones.update(zoneId, body, auth, meta);
  }
}

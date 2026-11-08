import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ServiceArea, ServicesSettings, ServicesStatus } from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { IntercitySettingsDto, ServiceAreaDto, UpdateServiceAreaDto } from './network.dto.js';
import { ServicesService } from './services.service.js';

/** Which services are on sale (ADR-029): the web and the apps show only these. */
@ApiTags('network')
@Controller({ version: '1' })
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get('platform/services')
  status(): Promise<ServicesStatus> {
    return this.services.status();
  }

  /** Every corridor, on or off, for operators preparing suburban routes. */
  @ApiBearerAuth()
  @Get('service-areas')
  areas(): Promise<ServiceArea[]> {
    return this.services.areas();
  }
}

/** The intercity switches: platform admins only. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin/services', version: '1' })
export class AdminServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  settings(): Promise<ServicesSettings> {
    return this.services.settings();
  }

  @Put('intercity')
  setIntercity(
    @Body() body: IntercitySettingsDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ServicesSettings> {
    return this.services.setIntercity(body, auth, meta);
  }
}

/** Corridors: reviewers curate their stops; only admins switch them on or off. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('reviewer')
@Controller({ path: 'admin/service-areas', version: '1' })
export class AdminServiceAreasController {
  constructor(private readonly services: ServicesService) {}

  @Post()
  create(
    @Body() body: ServiceAreaDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ServiceArea> {
    return this.services.createArea(body, auth, meta);
  }

  @Patch(':areaId')
  update(
    @Param('areaId', ParseUUIDPipe) areaId: string,
    @Body() body: UpdateServiceAreaDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ServiceArea> {
    return this.services.updateArea(areaId, body, auth, meta);
  }
}

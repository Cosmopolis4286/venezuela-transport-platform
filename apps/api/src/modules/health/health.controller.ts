import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse, ReadinessResponse } from '@vtp/shared-types';
import type { Response } from 'express';
import { Public } from '../identity/auth.decorators.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
// Probes from load balancers and uptime monitors must never be rate limited.
@SkipThrottle()
@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'The API process is running.' })
  live(): HealthResponse {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOkResponse({ description: 'All dependencies are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unreachable.' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const result = await this.health.readiness();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}

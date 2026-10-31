import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentAuth } from '../identity/auth.decorators.js';
import type { Authenticated } from '../identity/sessions.service.js';
import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/** The apps register their Expo push token after sign-in and remove it on sign-out. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'me/push-devices', version: '1' })
export class PushDevicesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  register(@CurrentAuth() auth: Authenticated, @Body() body: RegisterPushDeviceDto): Promise<void> {
    return this.notifications.register(auth.user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  unregister(
    @CurrentAuth() auth: Authenticated,
    @Body() body: UnregisterPushDeviceDto,
  ): Promise<void> {
    return this.notifications.unregister(auth.user.id, body.token);
  }
}

import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { PushDevicesController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import {
  ConsolePushSender,
  DisabledPushSender,
  ExpoPushSender,
  PUSH_SENDER,
} from './push-sender.js';
import { TripRemindersService } from './trip-reminders.service.js';

/**
 * Push notifications (Expo) and e-mails about bookings, refunds, trips and taxis (ADR-026).
 * Global: feature modules inject NotificationsService and call `send()` after their action.
 */
@Global()
@Module({
  controllers: [PushDevicesController],
  providers: [
    NotificationsService,
    TripRemindersService,
    {
      provide: PUSH_SENDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        switch (config.get('PUSH_DELIVERY')) {
          case 'expo':
            return new ExpoPushSender(config.get('EXPO_ACCESS_TOKEN'));
          case 'console':
            return new ConsolePushSender();
          default:
            return new DisabledPushSender();
        }
      },
    },
  ],
  exports: [NotificationsService, TripRemindersService],
})
export class NotificationsModule {}

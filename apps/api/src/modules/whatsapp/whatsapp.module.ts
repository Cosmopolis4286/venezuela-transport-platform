import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { TaxiModule } from '../taxi/taxi.module.js';
import { WhatsappBot } from './whatsapp-bot.js';
import {
  CloudWhatsappSender,
  ConsoleWhatsappSender,
  WHATSAPP_SENDER,
  type WhatsappSender,
} from './whatsapp-sender.js';
import { WhatsappWebhookController } from './whatsapp.controller.js';
import { WhatsappService } from './whatsapp.service.js';

/** Automatic WhatsApp: menu, taxi and moto requests in the chat, and ride notices (ADR-038). */
@Module({
  imports: [TaxiModule],
  controllers: [WhatsappWebhookController],
  providers: [
    WhatsappBot,
    WhatsappService,
    {
      provide: WHATSAPP_SENDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): WhatsappSender =>
        config.get('WHATSAPP_DELIVERY') === 'cloud'
          ? new CloudWhatsappSender({
              phoneNumberId: config.get('WHATSAPP_PHONE_NUMBER_ID'),
              accessToken: config.get('WHATSAPP_ACCESS_TOKEN'),
              graphVersion: config.get('WHATSAPP_GRAPH_VERSION'),
            })
          : new ConsoleWhatsappSender(),
    },
  ],
})
export class WhatsappModule {}

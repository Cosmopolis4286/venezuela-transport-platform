import { Module } from '@nestjs/common';
import { SupportController } from './support.controller.js';

/** Support contact for the web and the apps (`SUPPORT_WHATSAPP`). */
@Module({ controllers: [SupportController] })
export class SupportModule {}

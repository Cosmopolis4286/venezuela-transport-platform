import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { normalizeWhatsapp, type SupportContact } from '@vtp/shared-types';
import { AppConfigService } from '../../config/app-config.service.js';
import { Public } from '../identity/auth.decorators.js';

/** How to reach support (public): the web and the apps show a WhatsApp button when it is set. */
@ApiTags('support')
@Controller({ path: 'support', version: '1' })
export class SupportController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  contact(): SupportContact {
    return { whatsapp: normalizeWhatsapp(this.config.get('SUPPORT_WHATSAPP')) };
  }
}

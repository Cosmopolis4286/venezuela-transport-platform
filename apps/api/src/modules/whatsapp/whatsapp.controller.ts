import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/errors/api.exception.js';
import { Public } from '../identity/auth.decorators.js';
import { WhatsappService } from './whatsapp.service.js';

/**
 * Meta's webhook for the WhatsApp number (ADR-038). Public: Meta signs every call with the app
 * secret, and the setup call carries the verify token.
 */
@ApiExcludeController()
@Controller({ path: 'whatsapp/webhook', version: '1' })
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode: unknown,
    @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') challenge: unknown,
    @Res() res: Response,
  ): void {
    const echo = this.whatsapp.verifySubscription(mode, token, challenge);
    if (echo === null) {
      res.status(HttpStatus.FORBIDDEN).type('text/plain').send('Forbidden');
      return;
    }
    res.status(HttpStatus.OK).type('text/plain').send(echo);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ ok: true }> {
    if (!this.whatsapp.enabled) return { ok: true };
    if (!this.whatsapp.signatureOk(req.rawBody, signature)) {
      throw new ApiException('FORBIDDEN', 'Invalid signature', HttpStatus.FORBIDDEN);
    }
    try {
      await this.whatsapp.receive(req.body);
    } catch (error) {
      // Answer 200 anyway: Meta would retry, and the message is already recorded as handled.
      this.logger.error(`WhatsApp webhook failed: ${(error as Error).message}`);
    }
    return { ok: true };
  }
}

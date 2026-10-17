import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';

/**
 * Opaque bearer tokens. The prefix (`vtp_at_` / `vtp_rt_`) lets secret scanners recognise
 * leaked tokens. Only an HMAC of each token or code is stored, keyed with AUTH_SECRET.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(config: AppConfigService) {
    this.secret = config.get('AUTH_SECRET');
  }

  generate(kind: 'access' | 'refresh'): string {
    return `vtp_${kind === 'access' ? 'at' : 'rt'}_${randomBytes(32).toString('base64url')}`;
  }

  hash(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  matches(value: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(value));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

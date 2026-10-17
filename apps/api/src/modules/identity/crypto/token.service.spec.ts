import type { AppConfigService } from '../../../config/app-config.service.js';
import { TokenService } from './token.service.js';

const service = (secret = 'x'.repeat(32)) =>
  new TokenService({ get: () => secret } as unknown as AppConfigService);

describe('TokenService', () => {
  it('generates prefixed, high-entropy, unique tokens', () => {
    const tokens = service();
    const a = tokens.generate('access');
    expect(a).toMatch(/^vtp_at_[\w-]{43}$/);
    expect(tokens.generate('refresh')).toMatch(/^vtp_rt_[\w-]{43}$/);
    expect(tokens.generate('access')).not.toBe(a);
  });

  it('hashes deterministically per secret and compares in constant time', () => {
    const tokens = service();
    const hash = tokens.hash('value');
    expect(tokens.hash('value')).toBe(hash);
    expect(service('y'.repeat(32)).hash('value')).not.toBe(hash);
    expect(tokens.matches('value', hash)).toBe(true);
    expect(tokens.matches('other', hash)).toBe(false);
  });
});

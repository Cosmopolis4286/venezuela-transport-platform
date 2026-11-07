import type { AppConfigService } from '../../config/app-config.service.js';
import type { Mailer } from '../../mail/mailer.js';
import { reportUnexpectedError, setErrorSink } from './error-alerts.js';
import { ErrorAlertsService } from './error-alerts.service.js';

function setup(alertEmail: string | undefined, enabled = true) {
  const sent: { to: string; subject: string }[] = [];
  const mailer = {
    enabled,
    send: async (message: { to: string; subject: string }) => {
      sent.push(message);
    },
  } as unknown as Mailer;
  const config = { get: () => alertEmail } as unknown as AppConfigService;
  return { service: new ErrorAlertsService(config, mailer), sent };
}

describe('ErrorAlertsService', () => {
  afterEach(() => setErrorSink(undefined));

  it('sends the same error once per 15 minutes and at most 10 per hour', () => {
    const { service } = setup('ops@example.test');
    const t = 1_000_000_000;
    const boom = new Error('boom');
    expect(service.alert('ops@example.test', boom, 'GET /a', t)).toBe(true);
    expect(service.alert('ops@example.test', boom, 'GET /a', t + 60_000)).toBe(false);
    expect(service.alert('ops@example.test', boom, 'GET /a', t + 16 * 60_000)).toBe(true);
    for (let i = 0; i < 8; i += 1) {
      expect(service.alert('ops@example.test', new Error(`e${i}`), 'GET /b', t + 17 * 60_000)).toBe(
        true,
      );
    }
    expect(
      service.alert('ops@example.test', new Error('one more'), 'GET /c', t + 18 * 60_000),
    ).toBe(false);
    expect(service.alert('ops@example.test', new Error('later'), 'GET /c', t + 2 * 3_600_000)).toBe(
      true,
    );
  });

  it('only listens when ALERT_EMAIL is set and e-mail delivery is on', async () => {
    const request = { method: 'GET', path: '/x' } as never;
    const off = setup(undefined);
    off.service.onApplicationBootstrap();
    reportUnexpectedError(new Error('x'), request);
    const disabled = setup('ops@example.test', false);
    disabled.service.onApplicationBootstrap();
    reportUnexpectedError(new Error('x'), request);
    expect([...off.sent, ...disabled.sent]).toHaveLength(0);

    const on = setup('ops@example.test');
    on.service.onApplicationBootstrap();
    reportUnexpectedError(new Error('database down'), request);
    await Promise.resolve();
    expect(on.sent).toEqual([
      expect.objectContaining({
        to: 'ops@example.test',
        subject: '[VTP] Error en la API: database down',
      }),
    ]);
  });
});

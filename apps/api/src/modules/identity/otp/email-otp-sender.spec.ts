import type { MailMessage, Mailer } from '../../../mail/mailer.js';
import { EmailOtpSender } from './email-otp-sender.js';

class FakeMailer implements Mailer {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

describe('EmailOtpSender', () => {
  const expiresAt = () => new Date(Date.now() + 5 * 60_000);

  it('e-mails the code with its expiry', async () => {
    const mailer = new FakeMailer();
    await new EmailOtpSender(mailer).send({
      channel: 'email',
      destination: 'ana@example.com',
      code: '482913',
      purpose: 'login',
      expiresAt: expiresAt(),
    });
    expect(mailer.sent).toEqual([
      {
        to: 'ana@example.com',
        subject: 'Tu código de VTP: 482913',
        text: expect.stringMatching(/482913[\s\S]*5 minutos/),
      },
    ]);
  });

  it('refuses SMS and WhatsApp codes with 503 until a provider exists', async () => {
    const mailer = new FakeMailer();
    await expect(
      new EmailOtpSender(mailer).send({
        channel: 'sms',
        destination: '+584141234567',
        code: '111111',
        purpose: 'login',
        expiresAt: expiresAt(),
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(mailer.sent).toEqual([]);
  });
});

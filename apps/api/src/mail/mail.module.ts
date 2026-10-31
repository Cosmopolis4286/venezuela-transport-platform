import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { ConsoleMailer, DisabledMailer, MAILER, SmtpMailer } from './mailer.js';

/** The mailer chosen by `MAIL_DELIVERY`; injected with `@Inject(MAILER)`. */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        switch (config.get('MAIL_DELIVERY')) {
          case 'smtp':
            return new SmtpMailer(
              {
                host: config.get('SMTP_HOST'),
                port: config.get('SMTP_PORT'),
                secure: config.get('SMTP_SECURE'),
                user: config.get('SMTP_USER'),
                password: config.get('SMTP_PASSWORD'),
              },
              config.get('MAIL_FROM'),
            );
          case 'console':
            return new ConsoleMailer();
          default:
            return new DisabledMailer();
        }
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}

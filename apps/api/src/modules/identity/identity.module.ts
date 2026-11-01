import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service.js';
import { MAILER, type Mailer } from '../../mail/mailer.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './crypto/token.service.js';
import { MeController } from './me.controller.js';
import { ConsoleOtpSender, DisabledOtpSender, OTP_SENDER } from './otp/otp-sender.js';
import { EmailOtpSender } from './otp/email-otp-sender.js';
import { OtpService } from './otp/otp.service.js';
import { SessionsService } from './sessions.service.js';
import { UsersService } from './users.service.js';

/** Users, sessions and sign-in. Exports UsersService/SessionsService for other modules. */
@Module({
  imports: [AuditModule],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    UsersService,
    SessionsService,
    OtpService,
    TokenService,
    {
      provide: OTP_SENDER,
      inject: [AppConfigService, MAILER],
      useFactory: (config: AppConfigService, mailer: Mailer) => {
        switch (config.get('OTP_DELIVERY')) {
          case 'console':
            return new ConsoleOtpSender();
          case 'email':
            return new EmailOtpSender(mailer);
          default:
            return new DisabledOtpSender();
        }
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [UsersService, SessionsService],
})
export class IdentityModule {}

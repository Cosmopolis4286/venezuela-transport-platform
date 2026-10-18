import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUTH_CLIENTS,
  OTP_CHANNELS,
  type AuthClient,
  type ContactVerificationConfirmRequest,
  type OtpChannel,
  type OtpRequest,
  type OtpVerifyRequest,
  type PasswordLoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type UpdateProfileRequest,
} from '@vtp/shared-types';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** NIST SP 800-63B: length over composition rules. Upper bound keeps hashing cost bounded. */
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export class RegisterDto implements RegisterRequest {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  password!: string;

  @ApiProperty({ example: 'María' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ enum: AUTH_CLIENTS })
  @IsIn(AUTH_CLIENTS)
  client!: AuthClient;
}

export class PasswordLoginDto implements PasswordLoginRequest {
  @ApiProperty({ example: 'maria@example.com' })
  @IsString()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(PASSWORD_MAX)
  password!: string;

  @ApiProperty({ enum: AUTH_CLIENTS })
  @IsIn(AUTH_CLIENTS)
  client!: AuthClient;
}

export class OtpRequestDto implements OtpRequest {
  @ApiProperty({ enum: OTP_CHANNELS })
  @IsIn(OTP_CHANNELS)
  channel!: OtpChannel;

  @ApiProperty({ example: '0412-1234567', description: 'Phone (sms/whatsapp) or e-mail (email)' })
  @IsString()
  @Length(3, 254)
  destination!: string;
}

export class OtpVerifyDto implements OtpVerifyRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ enum: AUTH_CLIENTS })
  @IsIn(AUTH_CLIENTS)
  client!: AuthClient;
}

export class ContactVerificationConfirmDto implements ContactVerificationConfirmRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class RefreshDto implements RefreshRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  refreshToken!: string;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;
}

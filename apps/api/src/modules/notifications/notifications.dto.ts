import { ApiProperty } from '@nestjs/swagger';
import {
  EXPO_PUSH_TOKEN_PATTERN,
  LOCALES,
  PUSH_APPS,
  PUSH_PLATFORMS,
  type Locale,
  type PushApp,
  type PushPlatform,
  type RegisterPushDeviceRequest,
  type UnregisterPushDeviceRequest,
} from '@vtp/shared-types';
import { IsIn, Matches, MaxLength } from 'class-validator';

const tokenMessage = { message: 'token must be an Expo push token' };

export class RegisterPushDeviceDto implements RegisterPushDeviceRequest {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @MaxLength(200)
  @Matches(EXPO_PUSH_TOKEN_PATTERN, tokenMessage)
  token!: string;

  @ApiProperty({ enum: PUSH_APPS })
  @IsIn(PUSH_APPS)
  app!: PushApp;

  @ApiProperty({ enum: PUSH_PLATFORMS })
  @IsIn(PUSH_PLATFORMS)
  platform!: PushPlatform;

  @ApiProperty({ enum: LOCALES })
  @IsIn(LOCALES)
  locale!: Locale;
}

export class UnregisterPushDeviceDto implements UnregisterPushDeviceRequest {
  @ApiProperty()
  @MaxLength(200)
  @Matches(EXPO_PUSH_TOKEN_PATTERN, tokenMessage)
  token!: string;
}

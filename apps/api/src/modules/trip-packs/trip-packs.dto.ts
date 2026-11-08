import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CURRENCIES,
  TRANSPORT_MODES,
  TRIP_PACK_LIMITS,
  type BuyTripPackRequest,
  type Currency,
  type TransportMode,
  type TripPackProductInput,
} from '@vtp/shared-types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class TripPackProductDto implements TripPackProductInput {
  @ApiProperty()
  @IsUUID()
  serviceAreaId!: string;

  @ApiProperty({ type: [String], description: 'The two ends of the stretch (both directions)' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsUUID('all', { each: true })
  stopIds!: [string, string];

  @ApiProperty({ enum: TRANSPORT_MODES })
  @IsIn(TRANSPORT_MODES)
  mode!: TransportMode;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(TRIP_PACK_LIMITS.minTrips)
  @Max(TRIP_PACK_LIMITS.maxTrips)
  trips!: number;

  @ApiProperty({ example: '12.00' })
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'price must be a decimal with up to 2 places' })
  price!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TRIP_PACK_LIMITS.maxValidityDays)
  validityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTripPackProductDto extends PartialType(TripPackProductDto) {}

export class BuyTripPackDto implements BuyTripPackRequest {
  @ApiProperty()
  @IsUUID()
  productId!: string;
}

export class TripPackProductsQueryDto {
  @ApiPropertyOptional({ description: 'Only this corridor' })
  @IsOptional()
  @IsUUID()
  serviceAreaId?: string;
}

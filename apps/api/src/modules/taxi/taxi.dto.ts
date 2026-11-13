import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CURRENCIES,
  MAX_TAXI_PASSENGERS,
  ON_DEMAND_MODES,
  TAXI_DIRECTIONS,
  TAXI_RIDE_KINDS,
  type OnDemandMode,
  type ReplaceOnDemandFaresRequest,
  type TaxiRideKind,
  type AcceptTaxiRideRequest,
  type AssignTaxiRideRequest,
  type CompleteTaxiRideRequest,
  type PickUpTaxiRideRequest,
  type Currency,
  type ReplaceTaxiTerminalsRequest,
  type RequestTaxiRequest,
  type TaxiDirection,
} from '@vtp/shared-types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

export class RequestTaxiDto implements RequestTaxiRequest {
  @ApiPropertyOptional({ enum: TAXI_RIDE_KINDS, default: 'terminal' })
  @IsOptional()
  @IsIn(TAXI_RIDE_KINDS)
  kind?: TaxiRideKind;

  @ApiPropertyOptional({ description: 'Terminal rides' })
  @IsOptional()
  @IsUUID()
  terminalStopId?: string;

  @ApiPropertyOptional({ enum: TAXI_DIRECTIONS, description: 'Terminal rides' })
  @IsOptional()
  @IsIn(TAXI_DIRECTIONS)
  direction?: TaxiDirection;

  @ApiPropertyOptional({ description: 'Stretch rides' })
  @IsOptional()
  @IsUUID()
  fromStopId?: string;

  @ApiPropertyOptional({ description: 'Stretch rides' })
  @IsOptional()
  @IsUUID()
  toStopId?: string;

  @ApiPropertyOptional({ enum: ON_DEMAND_MODES, description: 'Stretch rides' })
  @IsOptional()
  @IsIn(ON_DEMAND_MODES)
  mode?: OnDemandMode;

  @ApiPropertyOptional({ description: 'Stretch rides booked for a time (ISO); omitted: now' })
  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;

  @ApiProperty({ example: 'Av. Bolívar, edificio Sol, frente a la plaza' })
  @IsString()
  @Length(5, 200)
  address!: string;

  @ApiPropertyOptional({ example: 'Llevo dos maletas' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  notes?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_TAXI_PASSENGERS)
  passengers!: number;

  @ApiPropertyOptional({ description: 'Stretch rides: pay with this trip pack of yours' })
  @IsOptional()
  @IsUUID()
  tripPackId?: string;

  @ApiPropertyOptional({ example: '0414-1234567' })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  contactPhone?: string;
}

class FareDto {
  @ApiProperty()
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({ example: '8.00', description: 'Terminal rides only' })
  @IsOptional()
  @IsString()
  @Matches(AMOUNT, { message: 'fareAmount must be a positive decimal with up to 2 decimals' })
  fareAmount?: string;

  @ApiPropertyOptional({ enum: CURRENCIES, description: 'Terminal rides only' })
  @IsOptional()
  @IsIn(CURRENCIES)
  fareCurrency?: Currency;
}

export class AcceptTaxiRideDto extends FareDto implements AcceptTaxiRideRequest {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;
}

export class AssignTaxiRideDto extends FareDto implements AssignTaxiRideRequest {
  @ApiProperty()
  @IsUUID()
  driverUserId!: string;
}

export class ReplaceTaxiTerminalsDto implements ReplaceTaxiTerminalsRequest {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  stopIds!: string[];
}

class OnDemandFareDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsUUID('all', { each: true })
  stopIds!: [string, string];

  @ApiProperty({ enum: ON_DEMAND_MODES })
  @IsIn(ON_DEMAND_MODES)
  mode!: OnDemandMode;

  @ApiProperty({ example: '4.00' })
  @Matches(AMOUNT, { message: 'amount must be a positive decimal with up to 2 decimals' })
  amount!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: Currency;
}

export class ReplaceOnDemandFaresDto implements ReplaceOnDemandFaresRequest {
  @ApiProperty({ type: [OnDemandFareDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OnDemandFareDto)
  fares!: OnDemandFareDto[];
}

export class StretchOptionsQueryDto {
  @ApiProperty()
  @IsUUID()
  from!: string;

  @ApiProperty()
  @IsUUID()
  to!: string;
}

export class CompleteTaxiRideDto implements CompleteTaxiRideRequest {
  @ApiPropertyOptional({
    description: 'false: the passenger did not pay the pending cancellation fees (default true)',
  })
  @IsOptional()
  @IsBoolean()
  feesCollected?: boolean;
}

export class PickUpTaxiRideDto implements PickUpTaxiRideRequest {
  @ApiPropertyOptional({ example: '0427', description: 'Required for rides paid with a pack' })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'pickupCode must be 4 digits' })
  pickupCode?: string;
}

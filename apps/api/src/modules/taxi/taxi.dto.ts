import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CURRENCIES,
  MAX_TAXI_PASSENGERS,
  TAXI_DIRECTIONS,
  TAXI_VEHICLE_TYPES,
  type AcceptTaxiRideRequest,
  type AssignTaxiRideRequest,
  type AssistedTaxiRequest,
  type RateTaxiRideRequest,
  type TaxiVehicleType,
  type Currency,
  type ReplaceTaxiTerminalsRequest,
  type RequestTaxiRequest,
  type TaxiDirection,
} from '@vtp/shared-types';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

export class RequestTaxiDto implements RequestTaxiRequest {
  @ApiProperty()
  @IsUUID()
  terminalStopId!: string;

  @ApiProperty({ enum: TAXI_DIRECTIONS })
  @IsIn(TAXI_DIRECTIONS)
  direction!: TaxiDirection;

  @ApiProperty({ example: 'Av. Bolívar, edificio Sol, frente a la plaza' })
  @IsString()
  @Length(5, 200)
  address!: string;

  @ApiPropertyOptional({ example: 'Hospital Central', description: 'Required for local rides' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  destination?: string;

  @ApiPropertyOptional({ enum: TAXI_VEHICLE_TYPES, default: 'car' })
  @IsOptional()
  @IsIn(TAXI_VEHICLE_TYPES)
  vehicleType?: TaxiVehicleType;

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

  @ApiProperty({ example: '8.00' })
  @IsString()
  @Matches(AMOUNT, { message: 'fareAmount must be a positive decimal with up to 2 decimals' })
  fareAmount!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  fareCurrency!: Currency;
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

export class AssistedTaxiDto implements AssistedTaxiRequest {
  @ApiProperty()
  @IsUUID()
  terminalStopId!: string;

  @ApiProperty({ enum: TAXI_DIRECTIONS })
  @IsIn(TAXI_DIRECTIONS)
  direction!: TaxiDirection;

  @ApiProperty({ example: 'Calle 5, casa azul frente a la bodega' })
  @IsString()
  @Length(5, 200)
  address!: string;

  @ApiPropertyOptional({ example: 'Mercado municipal' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  destination?: string;

  @ApiPropertyOptional({ enum: TAXI_VEHICLE_TYPES, default: 'car' })
  @IsOptional()
  @IsIn(TAXI_VEHICLE_TYPES)
  vehicleType?: TaxiVehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  notes?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_TAXI_PASSENGERS)
  passengers!: number;

  @ApiProperty({ example: 'Carmen' })
  @IsString()
  @Length(2, 80)
  customerName!: string;

  @ApiProperty({ example: '0414-7654321' })
  @IsString()
  @Length(7, 20)
  customerPhone!: string;
}

export class RateTaxiRideDto implements RateTaxiRideRequest {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'Muy puntual' })
  @IsOptional()
  @IsString()
  @Length(0, 300)
  comment?: string;
}

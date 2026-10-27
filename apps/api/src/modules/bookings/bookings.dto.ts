import { ApiProperty } from '@nestjs/swagger';
import {
  IDENTITY_DOCUMENT_TYPES,
  MAX_SEATS_PER_BOOKING,
  type CreateBookingRequest,
  type IdentityDocumentType,
  type PassengerInput,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class TripQueryDto {
  @ApiProperty()
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ example: '2026-11-20', description: 'Date the vehicle leaves the route origin' })
  @Matches(ISO_DATE, { message: 'serviceDate must be YYYY-MM-DD' })
  serviceDate!: string;

  @ApiProperty()
  @IsUUID()
  from!: string;

  @ApiProperty()
  @IsUUID()
  to!: string;
}

export class PassengerDto implements PassengerInput {
  @ApiProperty({ example: '12' })
  @IsString()
  @Length(1, 4)
  seatNumber!: string;

  @ApiProperty({ example: 'María' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ enum: IDENTITY_DOCUMENT_TYPES })
  @IsIn(IDENTITY_DOCUMENT_TYPES)
  documentType!: IdentityDocumentType;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @Matches(/^[A-Za-z0-9.\- ]{4,20}$/, { message: 'documentNumber is not valid' })
  documentNumber!: string;
}

export class CreateBookingDto implements CreateBookingRequest {
  @ApiProperty()
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ example: '2026-11-20' })
  @Matches(ISO_DATE, { message: 'serviceDate must be YYYY-MM-DD' })
  serviceDate!: string;

  @ApiProperty()
  @IsUUID()
  fromStopId!: string;

  @ApiProperty()
  @IsUUID()
  toStopId!: string;

  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SEATS_PER_BOOKING)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers!: PassengerDto[];
}

export class TripsDateQueryDto {
  @ApiProperty({ example: '2026-11-20' })
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

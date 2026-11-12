import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BUYER_ID_TYPES,
  IDENTITY_DOCUMENT_TYPES,
  MAX_SEATS_PER_BOOKING,
  type BuyerIdType,
  type CreateBookingRequest,
  type InvoiceBuyer,
  type SetBookingBillingRequest,
  type IdentityDocumentType,
  type PassengerInput,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
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
  @ApiPropertyOptional({ example: '12', description: 'Omitted on open tickets (frequency)' })
  @IsOptional()
  @IsString()
  @Length(1, 4)
  seatNumber?: string;

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

  @ApiPropertyOptional({
    example: '+58 412 123 4567',
    description: 'Phone or WhatsApp to reach the buyer',
  })
  @IsOptional()
  @Matches(/^[+\d\s().-]{7,20}$/, { message: 'contactPhone is not a valid phone number' })
  contactPhone?: string;
}

export class TripsDateQueryDto {
  @ApiProperty({ example: '2026-11-20' })
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

/** Either `qr`, or `bookingCode` with `seatNumber` (typed by hand). */
export class ValidateTicketDto {
  @ApiPropertyOptional({ example: 'VTP1.6f1c…', description: 'Payload read from the ticket QR' })
  @ValidateIf((o: ValidateTicketDto) => o.bookingCode === undefined)
  @IsString()
  @Length(1, 100)
  qr?: string;

  @ApiPropertyOptional({ example: 'VTP-7K3QXA' })
  @ValidateIf((o: ValidateTicketDto) => o.qr === undefined)
  @Matches(/^(VTP-?)?[A-Za-z0-9]{6}$/i, { message: 'bookingCode is not valid' })
  bookingCode?: string;

  @ApiPropertyOptional({ example: '12' })
  @ValidateIf((o: ValidateTicketDto) => o.qr === undefined)
  @IsString()
  @Length(1, 4)
  seatNumber?: string;
}

export class BillingDto implements InvoiceBuyer {
  @ApiProperty({ example: 'Inversiones Pérez, C.A.' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ enum: BUYER_ID_TYPES })
  @IsIn(BUYER_ID_TYPES)
  idType!: BuyerIdType;

  @ApiProperty({ example: '12345678-9' })
  @Matches(/^[0-9A-Za-z-]{4,20}$/, { message: 'idNumber must be 4 to 20 letters or digits' })
  idNumber!: string;

  @ApiProperty({ nullable: true, example: 'Av. Bolívar, Valencia' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 300)
  address!: string | null;
}

export class SetBookingBillingDto implements SetBookingBillingRequest {
  @ApiProperty({ type: BillingDto, nullable: true, description: 'null: the first passenger' })
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => BillingDto)
  billing!: BillingDto | null;
}

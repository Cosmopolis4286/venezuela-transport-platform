import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  SEAT_LAYOUT_LIMITS,
  type LayoutSeat,
  type SeatLayoutInput,
  type VehicleDocumentInput,
  type VehicleInput,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class LayoutSeatDto implements LayoutSeat {
  @ApiProperty({ example: '12' })
  @IsString()
  @Length(1, 4)
  number!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(SEAT_LAYOUT_LIMITS.maxDecks - 1)
  deck!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(SEAT_LAYOUT_LIMITS.maxRows - 1)
  row!: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  @Max(SEAT_LAYOUT_LIMITS.maxColumns - 1)
  column!: number;
}

/** Shape checks only; `layoutProblem()` validates the layout as a whole. */
export class SeatLayoutDto implements SeatLayoutInput {
  @ApiProperty({ example: 'Buscama 2-1' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(SEAT_LAYOUT_LIMITS.maxDecks)
  decks!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  @Max(SEAT_LAYOUT_LIMITS.maxRows)
  rows!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(SEAT_LAYOUT_LIMITS.minColumns)
  @Max(SEAT_LAYOUT_LIMITS.maxColumns)
  columns!: number;

  @ApiProperty({ type: [LayoutSeatDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SEAT_LAYOUT_LIMITS.maxSeats)
  @ValidateNested({ each: true })
  @Type(() => LayoutSeatDto)
  seats!: LayoutSeatDto[];
}

export class UpdateSeatLayoutDto extends PartialType(SeatLayoutDto) {}

/** `plateProblem()` validates the plate itself. */
export class VehicleDto implements VehicleInput {
  @ApiProperty({ example: 'AB123CD' })
  @IsString()
  @Length(1, 20)
  plate!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Unidad 12 · Encava 610' })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  label?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  seatLayoutId?: string | null;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateVehicleDto extends PartialType(VehicleDto) {}

export class VehicleDocumentDto implements VehicleDocumentInput {
  @ApiProperty({ example: 'RCV-2026-004512' })
  @IsString()
  @Length(1, 60)
  number!: string;

  @ApiProperty({ example: '2027-03-31', description: 'Last valid day' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresOn must look like 2027-03-31' })
  expiresOn!: string;
}

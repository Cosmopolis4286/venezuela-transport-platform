import { ApiProperty } from '@nestjs/swagger';
import {
  MAX_CASH_PASSENGERS,
  type CreateCashSaleRequest,
  type VoidCashSaleRequest,
} from '@vtp/shared-types';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreateCashSaleDto implements CreateCashSaleRequest {
  @ApiProperty()
  @IsUUID()
  routeId!: string;

  @ApiProperty()
  @IsUUID()
  fromStopId!: string;

  @ApiProperty()
  @IsUUID()
  toStopId!: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(MAX_CASH_PASSENGERS)
  passengers!: number;
}

export class VoidCashSaleDto implements VoidCashSaleRequest {
  @ApiProperty({ example: 'Lo registré dos veces' })
  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class CashSalesDayQueryDto {
  @ApiProperty({ required: false, example: '2026-11-12', description: 'Default: today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must look like 2026-11-12' })
  date?: string;
}

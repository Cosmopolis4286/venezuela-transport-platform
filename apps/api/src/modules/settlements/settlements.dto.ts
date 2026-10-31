import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COMMISSION_PATTERN,
  CURRENCIES,
  PAYOUT_METHODS,
  type CreatePayoutRequest,
  type Currency,
  type MarkRefundedRequest,
  type PayoutMethod,
  type SetCommissionRequest,
  type SettlementEntriesQuery,
  type VoidPayoutRequest,
} from '@vtp/shared-types';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

export class SettlementEntriesQueryDto implements SettlementEntriesQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'Venezuelan calendar month' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-10' })
  month?: string;
}

export class SetCommissionDto implements SetCommissionRequest {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '8.50',
    description: 'Percentage; null to use the platform default',
  })
  @ValidateIf((_, value) => value !== null)
  @Matches(COMMISSION_PATTERN, {
    message: 'rate must be a percentage between 0 and 100 with up to 2 decimals',
  })
  rate!: string | null;
}

export class CreatePayoutDto implements CreatePayoutRequest {
  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @ApiProperty({ example: '350.00' })
  @Matches(AMOUNT, { message: 'amount must be a decimal with up to 2 places' })
  amount!: string;

  @ApiProperty({ enum: PAYOUT_METHODS })
  @IsIn(PAYOUT_METHODS)
  method!: PayoutMethod;

  @ApiProperty({ example: '00123456789', description: 'Bank or wallet reference' })
  @IsString()
  @Length(2, 120)
  reference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class VoidPayoutDto implements VoidPayoutRequest {
  @ApiProperty({ example: 'Monto equivocado' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class MarkRefundedDto implements MarkRefundedRequest {
  @ApiProperty({ example: '00987654321', description: 'Reference of the refund transfer' })
  @IsString()
  @Length(2, 120)
  reference!: string;
}

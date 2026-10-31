import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  COMMISSION_PATTERN,
  CURRENCIES,
  MAX_REFUND_TIERS,
  PAYOUT_METHODS,
  type CreatePayoutRequest,
  type Currency,
  type MarkRefundedRequest,
  type PayoutMethod,
  type RefundTier,
  type SetOrganizationPolicyRequest,
  type SettlementPolicy,
  type SettlementEntriesQuery,
  type VoidPayoutRequest,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

export class SettlementEntriesQueryDto implements SettlementEntriesQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'Venezuelan calendar month' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-10' })
  month?: string;
}

export class RefundTierDto implements RefundTier {
  @ApiProperty({ example: 48, description: 'Hours before boarding' })
  @IsInt()
  @Min(0)
  @Max(720)
  hoursBefore!: number;

  @ApiProperty({ example: 100, description: 'Percent of the fare refunded' })
  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;
}

const commissionMessage = {
  message: 'commissionRate must be a percentage between 0 and 100 with up to 2 decimals',
};

export class SettlementPolicyDto implements SettlementPolicy {
  @ApiProperty({ example: '8.00' })
  @IsString()
  @Matches(COMMISSION_PATTERN, commissionMessage)
  commissionRate!: string;

  @ApiProperty({ type: [RefundTierDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REFUND_TIERS)
  @ValidateNested({ each: true })
  @Type(() => RefundTierDto)
  refundTiers!: RefundTierDto[];
}

export class SetOrganizationPolicyDto implements SetOrganizationPolicyRequest {
  @ApiProperty({ type: String, nullable: true, example: '7.50', description: 'null: platform default' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(COMMISSION_PATTERN, commissionMessage)
  commissionRate!: string | null;

  @ApiProperty({ type: [RefundTierDto], nullable: true, description: 'null: platform default' })
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REFUND_TIERS)
  @ValidateNested({ each: true })
  @Type(() => RefundTierDto)
  refundTiers!: RefundTierDto[] | null;
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_METHODS,
  RATE_CURRENCIES,
  type CreatePaymentRequest,
  type PaymentMethod,
  type RateCurrency,
  type ReplaceExchangeRatesRequest,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, Matches, ValidateNested } from 'class-validator';

const RATE = /^\d{1,13}(\.\d{1,4})?$/;
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export class ExchangeRateDto {
  @ApiProperty({ enum: RATE_CURRENCIES })
  @IsIn(RATE_CURRENCIES)
  currency!: RateCurrency;

  @ApiProperty({ example: '36.5000', description: 'Units of the currency per US dollar' })
  @Matches(RATE, { message: 'unitsPerUsd must be a decimal with up to 4 places' })
  unitsPerUsd!: string;
}

export class ReplaceExchangeRatesDto implements ReplaceExchangeRatesRequest {
  @ApiProperty({ type: [ExchangeRateDto] })
  @IsArray()
  @ArrayMaxSize(RATE_CURRENCIES.length)
  @ValidateNested({ each: true })
  @Type(() => ExchangeRateDto)
  rates!: ExchangeRateDto[];
}

export class CreatePaymentDto implements CreatePaymentRequest {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;
}

export class SimulatePaymentDto {
  @ApiPropertyOptional({ description: 'Amount received; defaults to the exact amount due' })
  @IsOptional()
  @Matches(AMOUNT, { message: 'amount must be a decimal with up to 2 places' })
  amount?: string;
}

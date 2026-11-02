import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAYMENT_METHODS,
  RATE_CURRENCIES,
  type ConfirmPaymentRequest,
  type CreatePaymentRequest,
  type PaymentAccountInput,
  type PaymentMethod,
  type RateCurrency,
  type RejectPaymentRequest,
  type ReplaceExchangeRatesRequest,
  type ReportPaymentRequest,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

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

export class PaymentMethodParamDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;
}

export class ReportPaymentDto implements ReportPaymentRequest {
  @ApiProperty({
    example: '004512873301',
    description: 'Bank operation number or transaction hash',
  })
  @IsString()
  @Length(4, 100)
  operationNumber!: string;
}

/** `paymentAccountProblem()` checks the fields of each method. */
export class PaymentAccountDto implements PaymentAccountInput {
  @ApiProperty({
    example: { bank: '0102 – Banco de Venezuela', phone: '0414-1234567', document: 'J-12345678-9' },
  })
  @IsObject()
  fields!: Record<string, string>;

  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

export class ConfirmPaymentDto implements ConfirmPaymentRequest {
  @ApiPropertyOptional({ description: 'What arrived; defaults to the amount due' })
  @IsOptional()
  @Matches(AMOUNT, { message: 'receivedAmount must be a decimal with up to 2 places' })
  receivedAmount?: string;
}

export class RejectPaymentDto implements RejectPaymentRequest {
  @ApiProperty({ example: 'No llegó ningún pago móvil con esa referencia.' })
  @IsString()
  @Length(3, 300)
  reason!: string;
}

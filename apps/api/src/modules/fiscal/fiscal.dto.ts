import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BUYER_ID_TYPES,
  INVOICE_STATUSES,
  TAXPAYER_TYPES,
  type BcvRate,
  type BuyerIdType,
  type FiscalSettingsInput,
  type InvoiceStatus,
  type InvoicesQuery,
  type IssueInvoiceRequest,
  type PurchaseInput,
  type TaxpayerType,
  type UpdateInvoiceBuyerRequest,
  type VoidInvoiceRequest,
} from '@vtp/shared-types';
import { IsIn, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

const RATE = /^\d{1,2}(\.\d{1,2})?$/;
const AMOUNT = /^\d{1,14}(\.\d{1,2})?$/;
const BCV = /^\d{1,12}(\.\d{1,6})?$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateMessage = { message: 'must be a date like 2026-11-08' };
const monthMessage = { message: 'month must look like 2026-11' };

export class FiscalSettingsDto implements FiscalSettingsInput {
  @ApiProperty({ example: 'Inversiones Pérez, F.P.' })
  @IsString()
  @Length(0, 200)
  legalName!: string;

  @ApiProperty({ example: 'V-12345678-9' })
  @IsString()
  @Length(0, 20)
  rif!: string;

  @ApiProperty({ example: 'Av. Bolívar, Valencia, Carabobo' })
  @IsString()
  @Length(0, 300)
  fiscalAddress!: string;

  @ApiProperty({ enum: TAXPAYER_TYPES })
  @IsIn(TAXPAYER_TYPES)
  taxpayerType!: TaxpayerType;

  @ApiProperty({ example: '16.00' })
  @Matches(RATE, { message: 'vatRate must be a percentage like 16.00' })
  vatRate!: string;
}

export class BcvRateDto implements BcvRate {
  @ApiProperty({ example: '2026-11-08' })
  @Matches(DATE, dateMessage)
  date!: string;

  @ApiProperty({ example: '245.123456', description: 'Bolívares per US dollar' })
  @Matches(BCV, { message: 'unitsPerUsd must be a decimal with up to 6 places' })
  unitsPerUsd!: string;
}

export class InvoicesQueryDto implements InvoicesQuery {
  @ApiPropertyOptional({ enum: INVOICE_STATUSES })
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '2026-11' })
  @IsOptional()
  @Matches(MONTH, monthMessage)
  month?: string;
}

export class MonthQueryDto {
  @ApiProperty({ example: '2026-11' })
  @Matches(MONTH, monthMessage)
  month!: string;
}

export class IssueInvoiceDto implements IssueInvoiceRequest {
  @ApiPropertyOptional({ example: '00000123', description: 'Draft mode: from the SENIAT portal' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  number?: string;

  @ApiPropertyOptional({ example: '00-00000123' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  controlNumber?: string;

  @ApiPropertyOptional({ example: '2026-11-08' })
  @IsOptional()
  @Matches(DATE, dateMessage)
  issuedOn?: string;
}

export class InvoiceBuyerDto implements UpdateInvoiceBuyerRequest {
  @ApiProperty()
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ enum: BUYER_ID_TYPES })
  @IsIn(BUYER_ID_TYPES)
  idType!: BuyerIdType;

  @ApiProperty({ example: '12345678' })
  @Matches(/^[0-9A-Za-z-]{4,20}$/, { message: 'idNumber must be 4 to 20 letters or digits' })
  idNumber!: string;

  @ApiProperty({ nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 300)
  address!: string | null;
}

export class VoidInvoiceDto implements VoidInvoiceRequest {
  @ApiProperty()
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class PurchaseDto implements PurchaseInput {
  @ApiProperty({ example: '2026-11-08' })
  @Matches(DATE, dateMessage)
  date!: string;

  @ApiProperty({ example: 'J-12345678-9' })
  @IsString()
  @Length(5, 20)
  supplierRif!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 200)
  supplierName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 40)
  invoiceNumber!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 40)
  controlNumber!: string;

  @ApiProperty({ example: '100.00', description: 'Bolívares' })
  @Matches(AMOUNT, { message: 'base must be an amount' })
  base!: string;

  @ApiProperty({ example: '0.00' })
  @Matches(AMOUNT, { message: 'exempt must be an amount' })
  exempt!: string;

  @ApiProperty({ example: '16.00' })
  @Matches(RATE, { message: 'vatRate must be a percentage like 16.00' })
  vatRate!: string;

  @ApiProperty({ example: '16.00' })
  @Matches(AMOUNT, { message: 'vat must be an amount' })
  vat!: string;
}

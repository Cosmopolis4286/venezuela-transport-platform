import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  BcvRate,
  FiscalSettings,
  Invoice,
  Purchase,
  PurchasesBook,
  SalesBook,
} from '@vtp/shared-types';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  BcvRateDto,
  FiscalSettingsDto,
  InvoiceBuyerDto,
  InvoicesQueryDto,
  IssueInvoiceDto,
  MonthQueryDto,
  PurchaseDto,
  VoidInvoiceDto,
} from './fiscal.dto.js';
import { FiscalService } from './fiscal.service.js';

/** The platform's invoices and fiscal books (ADR-031). Money: admins only. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole()
@Controller({ path: 'admin/fiscal', version: '1' })
export class AdminFiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get('settings')
  settings(): Promise<FiscalSettings> {
    return this.fiscal.settings();
  }

  @Put('settings')
  setSettings(
    @Body() body: FiscalSettingsDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FiscalSettings> {
    return this.fiscal.setSettings(body, auth, meta);
  }

  @Get('bcv-rates')
  bcvRates(): Promise<BcvRate[]> {
    return this.fiscal.bcvRates();
  }

  @Put('bcv-rates')
  setBcvRate(
    @Body() body: BcvRateDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<BcvRate> {
    return this.fiscal.setBcvRate(body, auth, meta);
  }

  @Get('invoices')
  invoices(@Query() query: InvoicesQueryDto): Promise<Invoice[]> {
    return this.fiscal.invoices(query);
  }

  @Get('invoices/:invoiceId')
  invoice(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<Invoice> {
    return this.fiscal.invoice(invoiceId);
  }

  @Patch('invoices/:invoiceId/buyer')
  updateBuyer(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: InvoiceBuyerDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Invoice> {
    return this.fiscal.updateBuyer(invoiceId, body, auth, meta);
  }

  @Post('invoices/:invoiceId/issue')
  @HttpCode(HttpStatus.OK)
  issue(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: IssueInvoiceDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Invoice> {
    return this.fiscal.issue(invoiceId, body, auth, meta);
  }

  @Post('invoices/:invoiceId/void')
  @HttpCode(HttpStatus.OK)
  void(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: VoidInvoiceDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Invoice> {
    return this.fiscal.void(invoiceId, body.reason, auth, meta);
  }

  @Get('books/sales')
  salesBook(@Query() query: MonthQueryDto): Promise<SalesBook> {
    return this.fiscal.salesBook(query.month);
  }

  @Get('books/purchases')
  purchasesBook(@Query() query: MonthQueryDto): Promise<PurchasesBook> {
    return this.fiscal.purchasesBook(query.month);
  }

  @Post('purchases')
  createPurchase(
    @Body() body: PurchaseDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Purchase> {
    return this.fiscal.createPurchase(body, auth, meta);
  }

  @Delete('purchases/:purchaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePurchase(
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.fiscal.deletePurchase(purchaseId, auth, meta);
  }
}

import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminFiscalController } from './fiscal.controller.js';
import { FiscalService } from './fiscal.service.js';
import {
  DraftInvoiceIssuer,
  INVOICE_ISSUER,
  UnconfiguredDigitalPrinter,
} from './invoice-issuer.js';

/**
 * Fiscal (ADR-031): the platform invoices its service fee. Drafts are written with the money by
 * `fiscal-ledger.ts`; staff issue them through the configured `InvoiceIssuer`.
 */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [AdminFiscalController],
  providers: [
    FiscalService,
    {
      provide: INVOICE_ISSUER,
      inject: [AppConfigService],
      // A contracted digital printer gets its own adapter here, with its own configuration.
      useFactory: (config: AppConfigService) =>
        config.get('INVOICE_ISSUER') === 'digital_printer'
          ? new UnconfiguredDigitalPrinter()
          : new DraftInvoiceIssuer(),
    },
  ],
})
export class FiscalModule {}

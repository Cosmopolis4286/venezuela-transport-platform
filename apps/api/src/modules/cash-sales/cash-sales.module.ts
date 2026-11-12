import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { CashSalesController } from './cash-sales.controller.js';
import { CashSalesService } from './cash-sales.service.js';

/** Cash sales recorded by drivers, counted in the operator's reports (ADR-033). */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule],
  controllers: [CashSalesController],
  providers: [CashSalesService],
})
export class CashSalesModule {}

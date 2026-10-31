import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import {
  AdminSettlementsController,
  OrganizationSettlementsController,
} from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

/**
 * Settlements (ADR-018, step 4): what each paid booking earns its operator, commissions, payouts
 * and the refund queue. Earnings are written by `PaymentsService` through `recordEarning`.
 */
@Module({
  imports: [IdentityModule, AuditModule, OrganizationsModule],
  controllers: [OrganizationSettlementsController, AdminSettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}

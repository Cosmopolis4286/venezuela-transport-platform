import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminOrganizationsController } from './admin-organizations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MeOrganizationsController } from './me-organizations.controller.js';
import { OrganizationAccessGuard } from './organization-access.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Bus companies, taxi lines and terminals, their members and invitations. Other modules guard
 * their routes with RequireOrganizationAccess(permission) from organization-access.ts.
 */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [OrganizationsController, MeOrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService, InvitationsService, OrganizationAccessGuard],
  exports: [OrganizationsService, OrganizationAccessGuard],
})
export class OrganizationsModule {}

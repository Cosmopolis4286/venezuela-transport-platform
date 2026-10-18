import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AdminApplicationsController } from './admin-applications.controller.js';
import { ApplicantController } from './applicant.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { OrganizationApplicantsController } from './organization-applicants.controller.js';

/** Driver and staff applications (KYC): documents, platform review and organization acceptance. */
@Module({
  imports: [
    IdentityModule,
    OrganizationsModule,
    AuditModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      // Files are held in memory only until validated and written to FileStorage.
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.get('FILE_UPLOAD_MAX_BYTES'), files: 1, fields: 5, parts: 6 },
      }),
    }),
  ],
  controllers: [ApplicantController, AdminApplicationsController, OrganizationApplicantsController],
  providers: [OnboardingService],
})
export class OnboardingModule {}

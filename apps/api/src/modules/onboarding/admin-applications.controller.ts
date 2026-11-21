import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  platformRoleHasPermission,
  type DocumentRenewal,
  type DocumentRenewalForReview,
  type ProviderApplication,
} from '@vtp/shared-types';
import type { Response } from 'express';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformPermission } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { sendDocument } from './document-response.js';
import {
  ApplicationStatusQueryDto,
  ReviewApplicationDto,
  ReviewDocumentRenewalDto,
} from './onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

/** Platform staff: KYC review queue. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('applications.review')
@Controller({ path: 'admin/applications', version: '1' })
export class AdminApplicationsController {
  constructor(private readonly onboarding: OnboardingService) {}

  @RequirePlatformPermission('applications.view')
  @Get()
  async list(
    @Query() query: ApplicationStatusQueryDto,
    @CurrentAuth() auth: Authenticated,
  ): Promise<ProviderApplication[]> {
    const applications = await this.onboarding.listForReview(query.status ?? 'submitted');
    if (platformRoleHasPermission(auth.user.platformRole, 'applications.review')) {
      return applications;
    }
    // Staff who only follow the queue (support) never see ID numbers, birth dates or vehicles.
    return applications.map((a) => ({
      ...a,
      documentNumber: '',
      birthDate: '',
      vehicle: null,
      documents: a.documents.map((d) => ({ ...d, fileName: '' })),
    }));
  }

  @Get(':applicationId')
  get(@Param('applicationId', ParseUUIDPipe) applicationId: string): Promise<ProviderApplication> {
    return this.onboarding.getForReview(applicationId);
  }

  @Get(':applicationId/documents/:documentId/file')
  async download(
    @CurrentAuth() auth: Authenticated,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendDocument(
      res,
      await this.onboarding.downloadForReview(auth, applicationId, documentId, meta),
    );
  }

  @Post(':applicationId/review')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentAuth() auth: Authenticated,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: ReviewApplicationDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ProviderApplication> {
    return this.onboarding.review(auth, applicationId, body, meta);
  }
}

/** Platform staff: renewed documents of approved drivers (ADR-042). */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformPermission('applications.review')
@Controller({ path: 'admin/document-renewals', version: '1' })
export class AdminDocumentRenewalsController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  list(): Promise<DocumentRenewalForReview[]> {
    return this.onboarding.listRenewals();
  }

  @Get(':renewalId/file')
  async download(
    @CurrentAuth() auth: Authenticated,
    @Param('renewalId', ParseUUIDPipe) renewalId: string,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendDocument(res, await this.onboarding.downloadRenewal(auth, renewalId, meta));
  }

  @Post(':renewalId/review')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentAuth() auth: Authenticated,
    @Param('renewalId', ParseUUIDPipe) renewalId: string,
    @Body() body: ReviewDocumentRenewalDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DocumentRenewal> {
    return this.onboarding.reviewRenewal(auth, renewalId, body, meta);
  }
}

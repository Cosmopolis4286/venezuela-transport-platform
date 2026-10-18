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
import type { ProviderApplication } from '@vtp/shared-types';
import type { Response } from 'express';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import { RequirePlatformRole } from '../identity/platform-role.guard.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { sendDocument } from './document-response.js';
import { ApplicationStatusQueryDto, ReviewApplicationDto } from './onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

/** Platform staff: KYC review queue. */
@ApiTags('admin')
@ApiBearerAuth()
@RequirePlatformRole('reviewer')
@Controller({ path: 'admin/applications', version: '1' })
export class AdminApplicationsController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  list(@Query() query: ApplicationStatusQueryDto): Promise<ProviderApplication[]> {
    return this.onboarding.listForReview(query.status ?? 'submitted');
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

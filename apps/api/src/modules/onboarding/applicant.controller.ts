import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { ProviderApplication } from '@vtp/shared-types';
import type { Response } from 'express';
import { CurrentAuth, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import { sendDocument } from './document-response.js';
import {
  ApplicationDto,
  DocumentKindParamDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from './onboarding.dto.js';
import { OnboardingService, type UploadedFile as Upload } from './onboarding.service.js';

/** The signed-in user's own application to work as a driver or staff member. */
@ApiTags('onboarding')
@ApiBearerAuth()
@Controller({ path: 'me/application', version: '1' })
export class ApplicantController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  current(@CurrentAuth() auth: Authenticated): Promise<ProviderApplication> {
    return this.onboarding.current(auth.user.id);
  }

  @Post()
  create(
    @CurrentAuth() auth: Authenticated,
    @Body() body: ApplicationDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ProviderApplication> {
    return this.onboarding.create(auth, body, meta);
  }

  @Patch()
  update(
    @CurrentAuth() auth: Authenticated,
    @Body() body: UpdateApplicationDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ProviderApplication> {
    return this.onboarding.update(auth, body, meta);
  }

  /** Uploads or replaces one document (multipart field `file`: JPG, PNG or PDF). */
  @Put('documents/:kind')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        expiresOn: { type: 'string', example: '2028-12-31' },
      },
    },
  })
  upload(
    @CurrentAuth() auth: Authenticated,
    @Param() params: DocumentKindParamDto,
    @UploadedFile() file: Upload | undefined,
    @Body() body: UploadDocumentDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ProviderApplication> {
    return this.onboarding.upload(auth, params.kind, file, body.expiresOn, meta);
  }

  @Get('documents/:documentId/file')
  async download(
    @CurrentAuth() auth: Authenticated,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendDocument(res, await this.onboarding.downloadOwn(auth, documentId));
  }

  /** Sends the application to platform review. All required documents must be uploaded. */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ProviderApplication> {
    return this.onboarding.submit(auth, meta);
  }
}

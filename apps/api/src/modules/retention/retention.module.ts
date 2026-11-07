import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service.js';

/** Daily purge of personal data past its retention period (docs/legal/conservacion-y-borrado.md). */
@Module({ providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}

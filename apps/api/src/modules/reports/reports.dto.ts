import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ReportRangeQuery } from '@vtp/shared-types';
import { IsOptional, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportRangeQueryDto implements ReportRangeQuery {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'First Venezuelan day (included)' })
  @IsOptional()
  @Matches(DATE, { message: 'from must look like 2026-10-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Last Venezuelan day (included)' })
  @IsOptional()
  @Matches(DATE, { message: 'to must look like 2026-10-31' })
  to?: string;
}

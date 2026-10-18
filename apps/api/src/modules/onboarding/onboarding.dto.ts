import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  APPLICATION_ROLES,
  APPLICATION_STATUSES,
  DOCUMENT_KINDS,
  IDENTITY_DOCUMENT_TYPES,
  type ApplicationInput,
  type ApplicationRole,
  type ApplicationStatus,
  type DocumentKind,
  type IdentityDocumentType,
  type ReviewApplicationRequest,
  type Vehicle,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class VehicleDto implements Vehicle {
  @ApiProperty({ example: 'AB123CD' })
  @IsString()
  @Length(5, 10)
  plate!: string;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @Length(1, 40)
  make!: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @Length(1, 40)
  model!: string;

  @ApiProperty({ example: 2015 })
  @IsInt()
  @Min(1970)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @ApiProperty({ example: 'Blanco' })
  @IsString()
  @Length(1, 30)
  color!: string;
}

export class ApplicationDto implements ApplicationInput {
  @ApiProperty({ enum: APPLICATION_ROLES })
  @IsIn(APPLICATION_ROLES)
  desiredRole!: ApplicationRole;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Organization to join (must be active)',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @ApiProperty({ example: 'José' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Rodríguez' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({
    enum: IDENTITY_DOCUMENT_TYPES,
    description: 'V venezolano, E extranjero, P pasaporte',
  })
  @IsIn(IDENTITY_DOCUMENT_TYPES)
  documentType!: IdentityDocumentType;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @MaxLength(20)
  documentNumber!: string;

  @ApiProperty({ example: '1990-04-21' })
  @Matches(ISO_DATE, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate!: string;

  @ApiPropertyOptional({ example: 'Lara' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({ example: 'Barquisimeto' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiProperty({ description: 'Drivers who work with their own vehicle (taxis)' })
  @IsBoolean()
  providesVehicle!: boolean;

  @ApiPropertyOptional({ type: VehicleDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleDto)
  vehicle?: VehicleDto | null;
}

export class UpdateApplicationDto extends PartialType(ApplicationDto) {}

export class DocumentKindParamDto {
  @IsIn(DOCUMENT_KINDS)
  kind!: DocumentKind;
}

/** Multipart text fields sent alongside the file. */
export class UploadDocumentDto {
  @ApiPropertyOptional({
    example: '2028-12-31',
    description: 'Expiry date, if the document has one',
  })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'expiresOn must be YYYY-MM-DD' })
  expiresOn?: string;
}

class DocumentVerdictDto {
  @IsUUID()
  documentId!: string;

  @IsIn(['accepted', 'rejected'])
  status!: 'accepted' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ReviewApplicationDto implements ReviewApplicationRequest {
  @ApiProperty({ enum: ['approve', 'reject', 'request_changes'] })
  @IsIn(['approve', 'reject', 'request_changes'])
  decision!: 'approve' | 'reject' | 'request_changes';

  @ApiPropertyOptional({ description: 'Required unless approving; shown to the applicant' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [DocumentVerdictDto] })
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DocumentVerdictDto)
  documents?: DocumentVerdictDto[];
}

export class ApplicationStatusQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_STATUSES, default: 'submitted' })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: ApplicationStatus;
}

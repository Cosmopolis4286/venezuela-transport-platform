import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_ROLES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  type CreateInvitationRequest,
  type CreateOrganizationRequest,
  type OrganizationRole,
  type OrganizationStatus,
  type OrganizationType,
  type ReviewOrganizationRequest,
  type UpdateMemberRoleRequest,
  type UpdateOrganizationRequest,
} from '@vtp/shared-types';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateOrganizationDto implements CreateOrganizationRequest {
  @ApiProperty({ enum: ORGANIZATION_TYPES })
  @IsIn(ORGANIZATION_TYPES)
  type!: OrganizationType;

  @ApiProperty({ example: 'Expresos del Llano C.A.' })
  @IsString()
  @Length(2, 160)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Expresos del Llano' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @ApiProperty({ example: 'J-12345678-9' })
  @IsString()
  @MaxLength(20)
  rif!: string;

  @ApiPropertyOptional({ example: '0212-5551234' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

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
}

export class UpdateOrganizationDto implements UpdateOrganizationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class CreateInvitationDto implements CreateInvitationRequest {
  @ApiProperty({ enum: ['email', 'phone'] })
  @IsIn(['email', 'phone'])
  contactKind!: 'email' | 'phone';

  @ApiProperty({ example: '0414-1234567' })
  @IsString()
  @Length(3, 254)
  destination!: string;

  @ApiProperty({ enum: ORGANIZATION_ROLES })
  @IsIn(ORGANIZATION_ROLES)
  role!: OrganizationRole;
}

export class UpdateMemberRoleDto implements UpdateMemberRoleRequest {
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  @IsIn(ORGANIZATION_ROLES)
  role!: OrganizationRole;
}

export class ReviewOrganizationDto implements ReviewOrganizationRequest {
  @ApiProperty({ enum: ['approve', 'reject', 'suspend'] })
  @IsIn(['approve', 'reject', 'suspend'])
  decision!: 'approve' | 'reject' | 'suspend';

  @ApiPropertyOptional({ description: 'Required for reject and suspend' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class OrganizationStatusQueryDto {
  @ApiPropertyOptional({ enum: ORGANIZATION_STATUSES, default: 'pending_review' })
  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES)
  status?: OrganizationStatus;
}

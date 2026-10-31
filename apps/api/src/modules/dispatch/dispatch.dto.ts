import { ApiProperty } from '@nestjs/swagger';
import type { AssignTripRequest } from '@vtp/shared-types';
import { IsUUID, Matches, ValidateIf } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DispatchDateQueryDto {
  @ApiProperty({ example: '2026-11-20' })
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class AssignTripDto implements AssignTripRequest {
  @ApiProperty()
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ example: '2026-11-20', description: 'Date the vehicle leaves the route origin' })
  @Matches(ISO_DATE, { message: 'serviceDate must be YYYY-MM-DD' })
  serviceDate!: string;

  @ApiProperty({ type: String, nullable: true, description: 'null clears the vehicle' })
  @ValidateIf((o: AssignTripDto) => o.vehicleId !== null)
  @IsUUID()
  vehicleId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'null clears the driver' })
  @ValidateIf((o: AssignTripDto) => o.driverUserId !== null)
  @IsUUID()
  driverUserId!: string | null;
}

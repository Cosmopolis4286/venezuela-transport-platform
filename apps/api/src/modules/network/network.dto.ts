import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  CURRENCIES,
  ROUTE_STATUSES,
  SERVICE_CLASSES,
  SCHEDULE_SERIES_LIMITS,
  SERVICES,
  STOP_KINDS,
  TRANSPORT_MODES,
  type ChangeRouteStatusRequest,
  type CityRef,
  type IntercitySettingsInput,
  type Service,
  type ScheduleSeriesInput,
  type ScheduleSeriesUpdate,
  type ServiceAreaInput,
  type Currency,
  type Fare,
  type ReplaceFaresRequest,
  type RouteInput,
  type RouteStatus,
  type ScheduleInput,
  type ServiceClass,
  type StopInput,
  type StopKind,
  type TransportMode,
} from '@vtp/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
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
import { MAX_MINUTES_FROM_ORIGIN } from './departures.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

export class StopDto implements StopInput {
  @ApiProperty({ enum: STOP_KINDS })
  @IsIn(STOP_KINDS)
  kind!: StopKind;

  @ApiProperty({ example: 'Terminal La Bandera' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: 'Caracas' })
  @IsString()
  @Length(2, 80)
  city!: string;

  @ApiProperty({ example: 'Distrito Capital' })
  @IsString()
  @Length(2, 60)
  state!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @ApiPropertyOptional({ example: 10.4806, nullable: true })
  @IsOptional()
  @IsLatitude()
  latitude?: number | null;

  @ApiPropertyOptional({ example: -66.9036, nullable: true })
  @IsOptional()
  @IsLongitude()
  longitude?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  operatorOrganizationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateStopDto extends PartialType(StopDto) {}

export class StopSearchQueryDto {
  /** Matches the name or the city, case-insensitive. */
  @ApiPropertyOptional({ example: 'maracaibo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: STOP_KINDS })
  @IsOptional()
  @IsIn(STOP_KINDS)
  kind?: StopKind;
}

export class RouteStopDto {
  @ApiProperty()
  @IsUUID()
  stopId!: string;

  @ApiProperty({ example: 0, description: 'Travel time from the origin; 0 for the origin' })
  @IsInt()
  @Min(0)
  @Max(MAX_MINUTES_FROM_ORIGIN)
  minutesFromOrigin!: number;
}

export class RouteDto implements RouteInput {
  @ApiProperty({ example: 'Caracas – Maracaibo' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ type: [RouteStopDto], description: 'Ordered from origin to destination' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops!: RouteStopDto[];

  @ApiPropertyOptional({
    enum: TRANSPORT_MODES,
    description: "Only on creation; defaults to the organization's first mode",
  })
  @IsOptional()
  @IsIn(TRANSPORT_MODES)
  mode?: TransportMode;

  @ApiPropertyOptional({ enum: SERVICES, description: 'Only on creation; defaults to intercity' })
  @IsOptional()
  @IsIn(SERVICES)
  service?: Service;

  @ApiPropertyOptional({ nullable: true, description: 'Corridor of a suburban route' })
  @IsOptional()
  @IsUUID()
  serviceAreaId?: string | null;
}

/** The mode, service and corridor are fixed once the route exists. */
export class UpdateRouteDto extends PartialType(
  OmitType(RouteDto, ['mode', 'service', 'serviceAreaId'] as const),
) {}

export class RouteStatusDto implements ChangeRouteStatusRequest {
  @ApiProperty({ enum: ROUTE_STATUSES })
  @IsIn(ROUTE_STATUSES)
  status!: RouteStatus;
}

export class FareDto implements Fare {
  @ApiProperty()
  @IsUUID()
  fromStopId!: string;

  @ApiProperty()
  @IsUUID()
  toStopId!: string;

  @ApiProperty({ example: '25.00' })
  @IsString()
  @Matches(AMOUNT, { message: 'amount must be a positive decimal with up to 2 decimals' })
  amount!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: Currency;
}

export class ReplaceFaresDto implements ReplaceFaresRequest {
  @ApiProperty({ type: [FareDto] })
  @IsArray()
  @ArrayMaxSize(780)
  @ValidateNested({ each: true })
  @Type(() => FareDto)
  fares!: FareDto[];
}

export class ScheduleDto implements ScheduleInput {
  @ApiProperty({ example: '08:30', description: 'Local time at the origin (America/Caracas)' })
  @Matches(TIME_OF_DAY, { message: 'departureTime must be HH:MM' })
  departureTime!: string;

  @ApiProperty({ example: [1, 2, 3, 4, 5], description: '0 = Sunday … 6 = Saturday' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @ApiProperty({ example: '2026-11-01' })
  @Matches(ISO_DATE, { message: 'validFrom must be YYYY-MM-DD' })
  validFrom!: string;

  @ApiPropertyOptional({ example: '2027-01-31', nullable: true })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil?: string | null;

  @ApiProperty({ enum: SERVICE_CLASSES })
  @IsIn(SERVICE_CLASSES)
  serviceClass!: ServiceClass;

  @ApiPropertyOptional({ example: 42, description: 'Required without a seat layout' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  seats?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Seat layout of this organization' })
  @IsOptional()
  @IsUUID()
  seatLayoutId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateScheduleDto extends PartialType(ScheduleDto) {}

export class DepartureSearchQueryDto {
  @ApiProperty({ description: 'Stop where the passenger boards' })
  @IsUUID()
  from!: string;

  @ApiProperty({ description: 'Stop where the passenger gets off' })
  @IsUUID()
  to!: string;

  @ApiProperty({ example: '2026-11-20', description: 'Local date of departure from `from`' })
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional({ enum: TRANSPORT_MODES, description: 'Only this kind of vehicle' })
  @IsOptional()
  @IsIn(TRANSPORT_MODES)
  mode?: TransportMode;

  @ApiPropertyOptional({ enum: SERVICES, description: 'Only this service' })
  @IsOptional()
  @IsIn(SERVICES)
  service?: Service;
}

export class CityRefDto implements CityRef {
  @ApiProperty({ example: 'Puerto Ordaz' })
  @IsString()
  @Length(2, 80)
  city!: string;

  @ApiProperty({ example: 'Bolívar' })
  @IsString()
  @Length(2, 60)
  state!: string;
}

export class IntercitySettingsDto implements IntercitySettingsInput {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: [CityRefDto], description: 'Cities without intercity sales' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CityRefDto)
  closedCities!: CityRefDto[];
}

export class ServiceAreaDto implements ServiceAreaInput {
  @ApiProperty({ example: 'Ciudad Guayana' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ type: [String], description: 'Catalog stops of the corridor' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  stopIds!: string[];

  @ApiPropertyOptional({ description: 'Platform admins only' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateServiceAreaDto extends PartialType(ServiceAreaDto) {}

export class ScheduleSeriesDto
  extends OmitType(ScheduleDto, ['departureTime', 'active'] as const)
  implements ScheduleSeriesInput
{
  @ApiProperty({ example: '05:00', description: 'First departure (America/Caracas)' })
  @Matches(TIME_OF_DAY, { message: 'firstDeparture must be HH:MM' })
  firstDeparture!: string;

  @ApiProperty({ example: '20:00', description: 'No departure after this time' })
  @Matches(TIME_OF_DAY, { message: 'lastDeparture must be HH:MM' })
  lastDeparture!: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(SCHEDULE_SERIES_LIMITS.minEveryMinutes)
  @Max(SCHEDULE_SERIES_LIMITS.maxEveryMinutes)
  everyMinutes!: number;
}

export class ScheduleSeriesUpdateDto implements ScheduleSeriesUpdate {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  Booking,
  TicketValidation,
  TripAvailability,
  TripManifest,
  TripSummary,
} from '@vtp/shared-types';
import { CurrentAuth, Public, ReqMeta } from '../identity/auth.decorators.js';
import type { Authenticated, RequestMeta } from '../identity/sessions.service.js';
import {
  CurrentOrganization,
  RequireOrganizationAccess,
  type OrganizationAccess,
} from '../organizations/organization-access.js';
import {
  CreateBookingDto,
  TripQueryDto,
  TripsDateQueryDto,
  ValidateTicketDto,
} from './bookings.dto.js';
import { BookingsService } from './bookings.service.js';
import { TicketsService } from './tickets.service.js';
import { TripsService } from './trips.service.js';

@ApiTags('bookings')
@Controller({ version: '1' })
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly trips: TripsService,
  ) {}

  /** Public: seat map, taken seats and price of one departure between two stops. */
  @Public()
  @Get('trips/availability')
  availability(@Query() query: TripQueryDto): Promise<TripAvailability> {
    return this.trips.availability(query.scheduleId, query.serviceDate, query.from, query.to);
  }

  /** Holds the seats while the passenger pays. */
  @ApiBearerAuth()
  @Post('bookings')
  create(
    @Body() body: CreateBookingDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Booking> {
    return this.bookings.create(auth, body, meta);
  }

  @ApiBearerAuth()
  @Get('me/bookings')
  mine(@CurrentAuth() auth: Authenticated): Promise<Booking[]> {
    return this.bookings.listMine(auth.user.id);
  }

  @ApiBearerAuth()
  @Get('me/bookings/:bookingId')
  one(
    @CurrentAuth() auth: Authenticated,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<Booking> {
    return this.bookings.getMine(auth.user.id, bookingId);
  }

  @ApiBearerAuth()
  @Post('me/bookings/:bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentAuth() auth: Authenticated,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Booking> {
    return this.bookings.cancelMine(auth, bookingId, meta);
  }
}

/** Operators: trips with bookings and the passenger list for boarding. */
@ApiTags('bookings')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/trips', version: '1' })
export class OrganizationTripsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequireOrganizationAccess('bookings.view')
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: TripsDateQueryDto,
  ): Promise<TripSummary[]> {
    return this.bookings.tripsOn(access.organization.id, query.date);
  }

  @Get(':tripId/manifest')
  @RequireOrganizationAccess('bookings.view')
  manifest(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ): Promise<TripManifest> {
    return this.bookings.manifest(access, tripId);
  }
}

/** Inspectors scan tickets at boarding. */
@ApiTags('bookings')
@ApiBearerAuth()
@Controller({ path: 'organizations/:organizationId/tickets', version: '1' })
export class OrganizationTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @RequireOrganizationAccess('tickets.validate')
  validate(
    @CurrentOrganization() access: OrganizationAccess,
    @Body() body: ValidateTicketDto,
    @CurrentAuth() auth: Authenticated,
    @ReqMeta() meta: RequestMeta,
  ): Promise<TicketValidation> {
    return this.tickets.validate(access, body.qr, auth, meta);
  }
}

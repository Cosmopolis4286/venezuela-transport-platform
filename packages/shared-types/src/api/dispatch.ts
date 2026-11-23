import type { BookingStatus, TripSummary } from './bookings.js';
import type { FleetVehicle, VehicleDocumentStatus } from './fleet.js';
import type { ServiceClass, StopSummary, TransportMode } from './network.js';
import type { Organization } from './organizations.js';

/** The vehicle and driver of a trip, as shown on trip lists. */
export type TripVehicle = Pick<FleetVehicle, 'id' | 'plate' | 'label'>;

export interface TripDriver {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * `GET /organizations/:id/dispatch?date=` — every departure the organization runs that day (from
 * its published schedules), whether or not anyone has booked it, with its assignment.
 */
export interface DispatchBoard {
  date: string;
  departures: DispatchDeparture[];
  /** Active vehicles that can be assigned, with a warning when their documents need attention. */
  vehicles: (TripVehicle & {
    mode: TransportMode;
    seatLayoutId: string | null;
    documentAlert: VehicleDocumentStatus | null;
  })[];
  /** Members whose role drives (`trips.drive`). */
  drivers: TripDriver[];
}

export interface DispatchDeparture {
  scheduleId: string;
  serviceDate: string;
  /** Null until the first booking or assignment creates the trip. */
  tripId: string | null;
  route: { id: string; name: string };
  /** Only vehicles of the route's mode fit. */
  mode: TransportMode;
  /** Leaves the route's origin / reaches its last stop (local ISO timestamps). */
  departsAt: string;
  arrivesAt: string;
  serviceClass: ServiceClass;
  /** Seat map of the departure; only vehicles with this layout (or none) fit. */
  seatLayoutId: string | null;
  capacity: number;
  soldSeats: number;
  heldSeats: number;
  vehicle: TripVehicle | null;
  driver: TripDriver | null;
  /** When the driver marked the departure and the arrival (UTC ISO); null until then. */
  departedAt: string | null;
  arrivedAt: string | null;
  /** The operator cancelled this departure: why and when; null otherwise. */
  cancellation: { reason: string; at: string } | null;
}

/**
 * `POST /organizations/:id/dispatch/cancel` — cancels one departure before it leaves. Every held
 * or paid booking is cancelled; paid ones are refunded in full (by whoever collected the money).
 */
export interface CancelDepartureRequest {
  scheduleId: string;
  serviceDate: string;
  /** Shown to the passengers. */
  reason: string;
}

export interface CancelDepartureResult {
  tripId: string;
  /** Bookings cancelled (held and paid). */
  cancelledBookings: number;
  /** Paid bookings now waiting for their refund. */
  refundsDue: number;
}

/**
 * `PUT /organizations/:id/dispatch/assignment` — sets (or clears, with null) the vehicle and the
 * driver of one departure. Creates the trip if nobody has booked it yet.
 */
export interface AssignTripRequest {
  scheduleId: string;
  serviceDate: string;
  vehicleId: string | null;
  driverUserId: string | null;
}

/** `GET /me/driving` — trips assigned to the signed-in driver, from 12 hours ago on. */
export interface DriverTrip extends Omit<TripSummary, 'vehicle' | 'driver'> {
  organization: Pick<Organization, 'id' | 'legalName' | 'tradeName'>;
  departsAt: string;
  arrivesAt: string;
  from: StopSummary;
  to: StopSummary;
  vehicle: TripVehicle | null;
}

/** `GET /me/driving/:tripId/passengers` — who boards and alights where, for the driver. */
export interface DriverManifest extends DriverTrip {
  /**
   * The route's stops in order, from where the trip starts: the pickup list goes stop by stop
   * (ADR-052). `arrivedAt` is when the driver said "Llegué" there (UTC ISO), null before.
   */
  stops: (StopSummary & { arrivedAt: string | null })[];
  passengers: {
    seatNumber: string;
    firstName: string;
    lastName: string;
    bookingStatus: BookingStatus;
    from: StopSummary;
    to: StopSummary;
    boardedAt: string | null;
  }[];
}

/**
 * A driver marks the trip: `POST /me/driving/:tripId/depart` (from 2 hours before the scheduled
 * departure) and then `…/arrive`. Once departed, passengers can no longer cancel.
 */
export const DEPART_EARLY_HOURS = 2;

/**
 * `POST /me/driving/:tripId/stops/:stopId/arrived`: the driver is at a stop (ADR-052). The
 * passengers who board there and have not boarded get a notice; the driver's screen counts down
 * this long. Said again at the same stop, nobody is notified twice.
 */
export const WAIT_AT_STOP_MINUTES = 2;

/**
 * `POST /me/driving/:tripId/depart|arrive`: `at` is when the driver tapped it, if marked without
 * signal and sent later (see `offlineTime`); now by default.
 */
export interface MarkTripRequest {
  at?: string;
}

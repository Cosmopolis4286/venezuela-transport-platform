import type { BookingStatus, TripSummary } from './bookings.js';
import type { FleetVehicle } from './fleet.js';
import type { ServiceClass, StopSummary } from './network.js';
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
  /** Active vehicles that can be assigned. */
  vehicles: (TripVehicle & { seatLayoutId: string | null })[];
  /** Members whose role drives (`trips.drive`). */
  drivers: TripDriver[];
}

export interface DispatchDeparture {
  scheduleId: string;
  serviceDate: string;
  /** Null until the first booking or assignment creates the trip. */
  tripId: string | null;
  route: { id: string; name: string };
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

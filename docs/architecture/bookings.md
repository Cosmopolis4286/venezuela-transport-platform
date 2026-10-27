# Bookings: trips and seat holds

Module `apps/api/src/modules/bookings`, contracts in `packages/shared-types/src/api/bookings.ts`.
This is step 2 of ADR-018: passengers choose seats and hold them. Payment, which confirms a
booking and issues tickets, is described in [payments.md](payments.md).

## Concepts

| Concept       | Notes                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trip**      | One schedule on one service date (the day the vehicle leaves the route's origin). Created on the first booking, with a **snapshot of the seat map** and the capacity, so later map edits never move a sold seat. |
| **Booking**   | One person's seats on one trip between two stops. Has a code like `VTP-7K3QXA`, the fare per passenger and the total frozen at booking time, and the boarding/arrival times of its segment.                      |
| **Passenger** | One row per seat: name, ID type and number.                                                                                                                                                                      |

Booking statuses: `held` (seats reserved until `expiresAt`, waiting for payment) → `confirmed`
(paid, with one ticket per seat, see [payments.md](payments.md)) or `cancelled` (by the passenger) or `expired` (the hold ran out).

## Rules

- A seat is **taken for the whole trip**, whatever segment the passenger rides. Simple and safe;
  reselling a seat freed at an intermediate stop is a later improvement.
- Holds last `BOOKING_HOLD_MINUTES` (default 15). Up to 6 seats per booking and 3 unpaid holds
  per person at a time, so seats cannot be hoarded.
- Only published departures can be booked: active schedule, route and organization, a fare for
  the pair of stops, and a boarding time still in the future.
- **No double booking:** a partial unique index on `(trip, seat)` over active passengers rejects
  a second hold of the same seat, even when two requests arrive at the same moment (tested).
  The loser gets `409` and a message to choose another seat.
- Expired holds are released lazily: reads count only confirmed bookings and unexpired holds,
  and the seats of expired holds are freed before new seats are taken.
- A schedule with trips cannot be deleted (pause it instead).
- The departure search returns `seatsAvailable` per departure.

## Endpoints (`/api/v1`)

| Method & path                                                              | Who                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /trips/availability?scheduleId=&serviceDate=&from=&to=`               | Public — seat map, taken seats, fare, bookable                      |
| `POST /bookings`                                                           | Signed in — hold seats                                              |
| `GET /me/bookings`, `GET /me/bookings/:id`, `POST /me/bookings/:id/cancel` | The booking's owner                                                 |
| `GET /organizations/:id/trips?date=`                                       | `bookings.view` (owner, admin, dispatcher, ticket agent, inspector) |
| `GET /organizations/:id/trips/:tripId/manifest`                            | `bookings.view` — passenger list with names, IDs and boarding time  |

Audit events: `booking.held`, `booking.cancelled`.

## Privacy

The manifest contains names and ID numbers. Only roles that need it for boarding see it
(`bookings.view`); drivers do not. Booking endpoints never return another user's bookings.

## Not yet

Cancellation of paid bookings with refunds, operator cancellation of a trip, and selling seats
per segment.

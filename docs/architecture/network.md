# Transport network: stops, routes, fares and schedules

Module `apps/api/src/modules/network`, contracts in `packages/shared-types/src/api/network.ts`.
The network is what passengers search: which operator goes from where to where, when, and at
what price. Booking, seats and dispatch build on it later.

## Concepts

| Concept       | Owner                    | Notes                                                                                       |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| **Stop**      | Platform staff (catalog) | `terminal` or roadside `stop`; name, city, state, optional address and WGS 84 point         |
| **Route**     | Bus company or taxi line | Ordered stops (2–40) with travel time from the origin; `draft` → `active` ⇄ `inactive`      |
| **Fare**      | Route                    | Price between two stops in travel order, in `USD` or `VES`; pairs without a fare are fine   |
| **Schedule**  | Route                    | Recurring departure from the origin: local time, days of week, validity dates, class, seats |
| **Departure** | Computed, not stored     | One schedule on one date, seen from the stop where the passenger boards                     |

- **Stops are shared.** Every operator uses the same "Terminal La Bandera", so passengers can
  search across companies. Operators ask platform staff for missing stops. A stop can be linked to
  the terminal organization that operates it. Names are unique per city (case-insensitive).
- **Taxi lines publish routes too** (por puesto services between cities); terminals do not.
- **Times are Venezuelan time** (America/Caracas, UTC−4, no daylight saving). Responses carry the
  `-04:00` offset.
- **Travel times, not timetables per stop.** Each stop stores minutes from the origin, so one
  schedule (e.g. 21:30) yields the time at every stop. Trips can last up to 72 hours.

## Rules

- `routes.manage` (owner, admin) edits routes, fares and schedules. Any member can read them.
  Other organizations get 404.
- A route needs: origin at 0 minutes, strictly increasing times, each stop once, all stops active.
  Replacing the stops drops fares whose stops left the route or changed order.
- **Publishing** (`draft`/`inactive` → `active`) requires an approved organization, at least one
  active schedule and the fare from the origin to the final destination. Published routes are
  deactivated, not deleted; only drafts can be deleted.
- Fares are positive decimals with up to two places. The list is replaced as a whole.
- Schedules: `HH:MM`, at least one day, 1–100 seats, `validUntil` on or after `validFrom`; up to
  100 per route. Pausing a schedule (`active: false`) hides it from search.

## Departure search

`GET /api/v1/search/departures?from=<stopId>&to=<stopId>&date=YYYY-MM-DD` is **public**. It
returns departures of active schedules on active routes of active organizations where `from`
comes before `to`, sorted by time, with the fare for that pair (or `null`).

The date is the local date at the boarding stop. A bus that leaves Caracas at 21:30 reaches
Valencia at 23:30 the same day but Maracaibo after midnight, so the search looks back up to three
service days (`departures.ts`, unit-tested): the result carries both the `serviceDate` (day it
left the origin) and the local `departsAt` / `arrivesAt`. Searches are limited to today through
180 days ahead.

Nothing is stored per trip yet. Bookings will need a trip record (to hold seats and cancel single
departures); it can be created on demand from the same calculation.

## Endpoints (`/api/v1`)

| Method & path                                                        | Who                     |
| -------------------------------------------------------------------- | ----------------------- |
| `GET /stops?q=&kind=`                                                | Public — active stops   |
| `GET/POST /admin/stops`, `PATCH /admin/stops/:stopId`                | Platform reviewer/admin |
| `GET /organizations/:id/routes`, `GET …/routes/:routeId`             | Members                 |
| `POST /organizations/:id/routes`, `PATCH`/`DELETE …/routes/:routeId` | `routes.manage`         |
| `POST …/routes/:routeId/status` (`active` / `inactive`)              | `routes.manage`         |
| `PUT …/routes/:routeId/fares`                                        | `routes.manage`         |
| `POST …/routes/:routeId/schedules`, `PATCH`/`DELETE …/schedules/:id` | `routes.manage`         |
| `GET /search/departures?from=&to=&date=`                             | Public                  |

Audit events: `stop.created`, `stop.updated`, `route.created`, `route.updated`, `route.deleted`,
`route.status_changed`, `route.fares_replaced`, `route.schedule_created`, `.schedule_updated`,
`.schedule_deleted`.

## Not yet

- Passenger search screens (web and mobile) — next delivery.
- Bays/platforms inside terminals, seat maps and vehicles (`fleet`).
- Exceptions to schedules (holidays, single cancelled departures) and real-time status.
- Currency conversion: each fare is shown in the currency the operator set.

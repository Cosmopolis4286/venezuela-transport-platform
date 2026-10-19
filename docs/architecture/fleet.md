# Fleet: seat maps

Module `apps/api/src/modules/fleet`, contracts in `packages/shared-types/src/api/fleet.ts`.
Passengers choose a numbered seat on a map of the bus, as they would at the ticket office.

## Seat layouts

A **seat layout** is the seat map of one type of vehicle an operator runs: a grid per deck (one or
two decks, up to 20 rows and 6 columns, up to 100 seats). Cells without a seat are aisle or empty
space. Each seat has a printed number (1–4 letters or digits).

- Bus companies and taxi lines manage their own layouts with the `fleet.manage` permission (owner,
  admin). Any member can read them; other organizations get 404.
- Presets to start from: 2-2 coach (44), 2-1 sleeper/buscama (30), double-decker (60), por puesto
  car (4). The web editor renumbers seats front to back after each change.
- Validation lives in `layoutProblem()` (shared by the API and the editor, Spanish messages):
  seats inside the grid, one seat per cell, unique numbers.

## Schedules and capacity

A schedule can reference a layout (`seatLayoutId`). Its `seats` is then the layout's capacity,
and editing the layout updates every schedule that uses it. A schedule without a layout keeps a
plain seat count. A layout in use cannot be deleted.

When bookings arrive, each trip will keep a snapshot of its layout, so editing a layout never
moves a seat that was already sold.

## Endpoints (`/api/v1`)

| Method & path                                                         | Who            |
| --------------------------------------------------------------------- | -------------- |
| `GET /organizations/:id/seat-layouts`, `GET …/seat-layouts/:layoutId` | Members        |
| `POST …/seat-layouts`, `PATCH`/`DELETE …/seat-layouts/:layoutId`      | `fleet.manage` |

Audit events: `seat_layout.created`, `.updated`, `.deleted`.

## Not yet

Vehicles (plates, documents) and assigning a vehicle and driver to each trip come with dispatch.

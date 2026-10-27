# Progress and roadmap

What the platform does today, what is next and what is still pending. Updated with every pull
request that changes it; the history of changes is in the [CHANGELOG](../CHANGELOG.md).

**Status (2026-10-27): in development, not deployed.** The full ticket-sale flow works end to end
with a simulated payment provider. Nothing is ready for real users or real money yet; see
[Before production](#before-production).

Legend: ✅ done · 🟡 partial · ⏭️ next · ⬜ pending

## By user

| Who                                  | Can do today                                                                                                                                                                          | Missing                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Passenger** (app, website)         | Search departures (no account needed), choose seats on the bus map, hold them 15 min, pay (simulated) by pago móvil, transfer, PIX or USDT, show one QR ticket per seat, "Mis viajes" | Real payments, refunds and cancelling a paid trip, notifications, taxi rides |
| **Bus company / taxi line** (portal) | Register and get approved, invite staff with roles, accept verified applicants, publish routes, fares, schedules and seat maps, set exchange rates, see trips and passenger lists     | Settlements (what the platform owes them), vehicles, dispatch, reports       |
| **Inspector** (transport app)        | Scan tickets at boarding (camera or code + seat), see who boarded in the passenger list                                                                                               | Offline scanning                                                             |
| **Driver / staff** (transport app)   | Sign in, accept invitations, apply with KYC documents                                                                                                                                 | Assigned trips, dispatch                                                     |
| **Platform staff** (admin panel)     | Approve organizations and KYC applications, curate the stop catalog                                                                                                                   | Payments to refund, settlements, metrics                                     |

## By area

| Area                         | Status | Notes                                                                                                                                                                        |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation                   | ✅     | Monorepo, Docker Compose (PostgreSQL + PostGIS), OpenAPI, lint, tests, production images, CircleCI and a self-hosted runner                                                  |
| Accounts and sign-in         | 🟡     | E-mail + password and one-time codes work. **Codes are only printed to the log**: no SMS / WhatsApp / e-mail provider yet ([authentication](architecture/authentication.md)) |
| Organizations and roles      | ✅     | Bus companies, taxi lines, terminals; six roles and a permission matrix; invitations; platform review ([organizations](architecture/organizations.md))                       |
| Driver and staff KYC         | ✅     | Applications, documents, platform review, organization acceptance ([onboarding](architecture/onboarding.md))                                                                 |
| Transport network            | ✅     | Stops, routes, fares per pair of stops, weekly schedules, departure search ([network](architecture/network.md))                                                              |
| Seat maps                    | ✅     | Layout editor with presets; schedules take their capacity from the map ([fleet](architecture/fleet.md))                                                                      |
| Bookings                     | ✅     | Seat holds on the bus map, no double booking, passenger lists ([bookings](architecture/bookings.md))                                                                         |
| Payments                     | 🟡     | Exchange rates, four methods, automatic confirmation through adapters — **simulated provider only** ([payments](architecture/payments.md))                                   |
| Tickets and boarding         | ✅     | QR per seat, scanner in the transport app, boarding time in the passenger list                                                                                               |
| Settlements and commission   | ⏭️     | Waiting for the commission decision (see [Decisions needed](#decisions-needed))                                                                                              |
| Refunds                      | ⬜     | Payments are marked `refund_due`; there is no screen or process to pay them back yet                                                                                         |
| Taxi dispatch                | ⬜     | Requests, matching and trip lifecycle for taxis to and from terminals                                                                                                        |
| Vehicles and trip assignment | ⬜     | Plates, documents, assigning a vehicle and driver to each trip                                                                                                               |
| Notifications                | ⬜     | SMS / WhatsApp / e-mail / push (codes, payment confirmation, trip reminders)                                                                                                 |
| Reports                      | ⬜     | Sales and occupancy for operators; metrics for the platform                                                                                                                  |
| Deployment                   | ⬜     | Preparation documented ([VPS](deployment/vps-preparation.md)); nothing deployed                                                                                              |

## Next steps

In order; each is one pull request.

1. ⏭️ **Settlements (step 4 of ADR-018).** A ledger of what the platform owes each operator per
   paid booking (fare minus commission), the operator's balance in the portal, recording payouts,
   and an admin list of `refund_due` payments to handle.
2. **Refunds and cancelling paid bookings**, with the policy the product owner sets (deadline,
   fee).
3. **Notifications**: a real provider for sign-in codes first (it blocks production), then
   payment confirmation and trip reminders.
4. **Vehicles and trip assignment**, the base for dispatch.
5. **Taxi dispatch** to and from terminals.
6. **Reports** for operators and platform metrics.

## Backlog (smaller items)

- Bookings: operator cancels a trip (and refunds its passengers); resell a seat freed at an
  intermediate stop.
- Network: schedule exceptions (holidays, single cancelled departures), bays inside terminals,
  real-time status.
- Tickets: offline validation (signed QR codes and syncing boardings).
- Mobile: native date picker; Spanish text for every API validation message; push notifications
  instead of pull-to-refresh.
- Payments: periodic cleanup of expired holds (today they are released lazily).

## Decisions needed

| Decision                                                                                       | Needed for              |
| ---------------------------------------------------------------------------------------------- | ----------------------- |
| Platform commission: percentage, and whether it is the same for every operator                 | Settlements (next step) |
| How often operators are paid, and how (transfer, pago móvil, USDT)                             | Settlements             |
| Refund policy: until when a passenger can cancel, and whether a fee is kept                    | Refunds                 |
| Payment providers to contract: bank or gateway for pago móvil and transfers, PIX, USDT network | Real payments           |
| SMS / WhatsApp / e-mail provider for sign-in codes                                             | Production              |

## Before production

None of these is done yet:

- [ ] Legal review: collecting money for third parties and accepting crypto in Venezuela and
      Brazil (ADR-018).
- [ ] Real payment provider adapters, with their keys in server configuration
      (`PAYMENT_PROVIDER=disabled` until then).
- [ ] A real delivery provider for sign-in codes (`OTP_DELIVERY` is `console` or `disabled` today).
- [ ] Settlements and a refund process, so money owed to operators and passengers is tracked.
- [ ] Server, HTTPS, backups with a tested restore, monitoring
      ([VPS preparation](deployment/vps-preparation.md)).
- [ ] Mobile builds signed and published (EAS) with the production API URL.
- [ ] Privacy notice and terms of use (passenger ID numbers are stored).

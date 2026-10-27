# Payments and tickets

Module `apps/api/src/modules/payments`, contracts in `packages/shared-types/src/api/payments.ts`.
This is step 3 of ADR-018: the passenger pays a held booking, the platform confirms the payment
automatically, and every seat gets a ticket with a QR code that inspectors scan at boarding.
Settlements to operators (fares minus commission) are the next step.

## Flow

1. The passenger holds seats (`bookings.md`) and opens the booking.
2. `GET /me/bookings/:id/payment-options` lists the methods available, each with the amount
   already converted: pago móvil and bank transfer in bolívares, PIX in reais, USDT.
3. The passenger picks one: `POST /me/bookings/:id/payments`. The amount and rate are **frozen**
   on the payment and the provider returns the instructions (account, phone, PIX key, wallet) and
   a **reference** like `VTP-7K3QXA-4M` to write in the transfer concept. Choosing another method
   voids the previous pending payment; a booking has at most one pending payment.
4. The provider adapter reports the money (`PaymentsService.receive`). The app polls every 5 s.
5. If the booking is still held, it becomes `confirmed` and each passenger gets a ticket.

## Exchange rates

Each operator sets its own rates in the portal (`PUT /organizations/:id/exchange-rates`,
`routes.manage`): bolívares and reais per US dollar, up to four decimals. USDT is 1:1 with the
dollar. Conversion goes through the dollar and rounds half up to cents, in integer arithmetic
(`money.ts`). A method that needs a missing rate is not offered. With a fare in bolívares, pago
móvil and transfers need no rate.

| Method        | Receives | Rate needed for a USD fare | For a VES fare |
| ------------- | -------- | -------------------------- | -------------- |
| Pago móvil    | VES      | VES                        | none           |
| Transferencia | VES      | VES                        | none           |
| PIX           | BRL      | BRL                        | VES and BRL    |
| USDT          | USDT     | none                       | VES            |

## Payment statuses

| Status       | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `pending`    | Waiting for the money; expires with the booking's hold                                        |
| `confirmed`  | Received in time; the booking is confirmed                                                    |
| `cancelled`  | Replaced by another method, or the booking was cancelled or expired before the money arrived  |
| `refund_due` | Money arrived for a booking that can no longer be confirmed, or less money / another currency |

Rules:

- **Late by seconds is fine:** money for a hold that ran out still confirms the booking while its
  seats were not released yet (nobody else can hold them before that). Row locks serialize the
  confirmation with the release of expired holds.
- Money for a voided payment, or too little, is marked `refund_due` and never confirms the
  booking. More than due confirms it. Refunds are handled by hand until the settlements step.
- `receive` is idempotent: a repeated notification changes nothing.
- Pending payments of cancelled or expired bookings are voided lazily, like expired holds.
- Paid bookings cannot be cancelled by the passenger yet (refund policy comes later).

## Providers

`PaymentProvider` (`payment-provider.ts`) is the adapter interface: which methods it supports and
the instructions for a payment. Real adapters (a Venezuelan bank or gateway, a PIX institution, a
USDT wallet watcher) will receive webhooks or poll, then call `PaymentsService.receive` with the
reference, amount and their own transaction id. Their credentials go in environment variables.

`PAYMENT_PROVIDER` selects what runs today:

| Value       | Default            | Behaviour                                                                                                         |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `simulated` | outside production | Fake accounts (`Banco Simulado`, `…SIMULADO…`); `POST /me/payments/:id/simulate` reports the money (tests, demos) |
| `disabled`  | production         | No method is offered; holds simply expire                                                                         |

The configuration **refuses `simulated` in production**, and the simulate endpoint answers 404
whenever the simulator is off.

## Tickets

A confirmed booking returns `ticket: { qr, boardedAt }` for each passenger. The QR payload is
`VTP1.<ticket id>`: an unguessable random id, so the code carries no personal data and needs no
secret. The passenger app draws it with plain views (`qrcode-generator`, no native module).

Inspectors scan it with the transport app (**Validar boletos**), which calls
`POST /organizations/:id/tickets/validate` with `tickets.validate` (owner, admin, inspector). The
body is `{ qr }`, or `{ bookingCode, seatNumber }` typed by hand when the passenger's screen cannot
be read (the code is accepted with or without `VTP-`, in any case). A ticket of another
organization, or one that does not exist, is 404. Otherwise the response says what to do, with the
passenger's name, ID, seat and segment:

| `result`          | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `boarded`         | Valid: the passenger may board; marked as boarded now      |
| `already_boarded` | Used before (`boardedAt` says when): a copied or reused QR |
| `not_paid`        | The booking is held, cancelled or expired                  |
| `other_departure` | The passenger boards more than **12 hours** away from now  |

Only the first valid check marks boarding. The manifest shows the boarding time.

## Endpoints (`/api/v1`)

| Method & path                              | Who                                                   |
| ------------------------------------------ | ----------------------------------------------------- |
| `GET /me/bookings/:id/payment-options`     | The booking's owner, while held                       |
| `POST /me/bookings/:id/payments`           | The booking's owner, while held                       |
| `POST /me/payments/:id/simulate`           | The payment's owner; only with the simulated provider |
| `GET /organizations/:id/exchange-rates`    | Members                                               |
| `PUT /organizations/:id/exchange-rates`    | `routes.manage`                                       |
| `POST /organizations/:id/tickets/validate` | `tickets.validate`                                    |

Audit events: `payment.created`, `payment.confirmed`, `payment.refund_due`,
`exchange_rates.replaced`, `ticket.boarded`.

## Not yet

Real provider adapters (contracts and legal review first, see ADR-018), refunds and cancellation
of paid bookings, the platform commission and settlements to operators, and offline validation.

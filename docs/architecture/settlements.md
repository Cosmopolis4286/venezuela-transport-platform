# Liquidaciones y reembolsos

Módulo `apps/api/src/modules/settlements`, contratos en
`packages/shared-types/src/api/settlements.ts`. Es el paso 4 del ADR-018: los pasajeros le pagan a
la plataforma, y la plataforma lleva la cuenta de lo que le debe a cada empresa y de los pagos que
le hace. También aquí está la cola de los pagos por reembolsar. La forma de la comisión está en el
ADR-024.

## Cómo se gana el dinero

Cuando un pago confirma una reserva (`PaymentsService.receive`), la **misma transacción** escribe
una fila en `settlement_entries` (`recordEarning`, en `ledger.ts`):

| Campo             | Valor                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| `gross`           | El total de la reserva, en la moneda de la tarifa (USD o VES)         |
| `commission_rate` | La comisión vigente en ese momento (ver abajo)                        |
| `commission`      | `gross × rate / 100`, redondeado hacia arriba en la mitad, a céntimos |
| `earned`          | `gross − commission`: lo que gana la empresa                          |

- **En la moneda de la tarifa**, no en la del pago. Una tarifa en dólares pagada por pago móvil en
  bolívares o por PIX en reales le da a la empresa dólares: la tasa la fijó la propia empresa
  (ver [payments.md](payments.md)), así que el riesgo de cambio es suyo hasta el momento de pagar.
- **Una fila por reserva** (índice único sobre `booking_id`): una notificación repetida del
  proveedor no gana dos veces.
- **Las filas no cambian.** Cambiar la comisión solo afecta a las reservas que se paguen después.
  Cuando existan los reembolsos de reservas pagadas, cada uno agregará su propia fila.
- Las reservas confirmadas antes de este módulo no tienen fila (no hay datos de producción).

## La comisión

- `PLATFORM_COMMISSION_PERCENT` (configuración de la API) es el valor por defecto: un porcentaje
  entre 0 y 100 con hasta dos decimales. Vale **0** hasta que el dueño del producto decida el
  número.
- Un administrador de la plataforma puede fijar otra comisión para una empresa
  (`organization_commissions`); dejarla vacía vuelve al valor por defecto.

## Saldo y pagos a las empresas

El saldo se calcula por moneda: `ganado − pagado`, donde los pagos anulados no cuentan.

Un administrador registra cada transferencia que hace a una empresa (`payouts`): moneda, monto,
medio (transferencia, pago móvil, USDT), referencia y una nota. Reglas:

- **Nunca más que el saldo** de esa moneda (`409 PAYOUT_EXCEEDS_BALANCE`). La fila de la
  organización se bloquea mientras se registra, así que dos pagos simultáneos no gastan el mismo
  saldo.
- **Un pago equivocado se anula, no se edita ni se borra** (`POST /admin/payouts/:id/void`, con
  motivo). El saldo lo recupera; anularlo dos veces da `409 PAYOUT_ALREADY_VOIDED`.
- La frecuencia (diaria, semanal) es una decisión de operación: el saldo se calcula igual.

## Reembolsos

Los pagos `refund_due` (dinero que llegó tarde, de menos, en otra moneda o para un pago anulado,
ver [payments.md](payments.md)) aparecen en **Reembolsos**, los más antiguos primero, con el
pasajero, su contacto, lo que se pedía y lo que llegó. El administrador devuelve el dinero por el
mismo medio y lo marca con la referencia de la devolución: el pago pasa a `refunded`
(`refunded_at`, `refund_reference`). Solo un pago `refund_due` se puede marcar
(`409 PAYMENT_NOT_REFUND_DUE`). El pasajero ve en la app que se le devolvió.

Cancelar una reserva **pagada** sigue sin existir: depende de la política de reembolsos (ver la
[hoja de ruta](../roadmap.md)).

## Quién ve qué

| Quién                                                | Ve y hace                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dueño y administrador de la empresa (`finance.view`) | Su saldo, sus reservas pagadas por mes y los pagos recibidos (portal → **Liquidaciones**)        |
| Administrador de la plataforma (`admin`)             | Todo lo anterior para cada empresa, la comisión, registrar y anular pagos, la cola de reembolsos |
| Revisor de la plataforma (`reviewer`)                | Nada de esto: el dinero es solo para los administradores (403)                                   |

## Endpoints (`/api/v1`)

| Método y ruta                                                   | Quién          |
| --------------------------------------------------------------- | -------------- |
| `GET /organizations/:id/settlement`                             | `finance.view` |
| `GET /organizations/:id/settlement/entries?month=YYYY-MM`       | `finance.view` |
| `GET /organizations/:id/payouts`                                | `finance.view` |
| `GET /admin/settlements`                                        | Administrador  |
| `GET /admin/organizations/:id/settlement`                       | Administrador  |
| `GET /admin/organizations/:id/settlement/entries?month=YYYY-MM` | Administrador  |
| `GET /admin/organizations/:id/payouts`                          | Administrador  |
| `PUT /admin/organizations/:id/commission`                       | Administrador  |
| `POST /admin/organizations/:id/payouts`                         | Administrador  |
| `POST /admin/payouts/:id/void`                                  | Administrador  |
| `GET /admin/refunds`                                            | Administrador  |
| `POST /admin/refunds/:paymentId`                                | Administrador  |

El mes de `entries` es el calendario venezolano (por defecto, el actual) y se cuenta por la fecha
en que se confirmó el pago. `GET /admin/settlements` lista las empresas de autobuses activas y
cualquier otra con ganancias o pagos.

Eventos de auditoría: `settlement.commission_set`, `settlement.payout_created`,
`settlement.payout_voided`, `payment.refunded`.

## Todavía no

Reembolsos y cancelación de reservas pagadas (con su fila negativa en el libro), comisión sobre
los taxis (hoy se pagan directo al conductor), exportar el libro a una hoja de cálculo, y pagar a
las empresas a través de un proveedor en vez de a mano.

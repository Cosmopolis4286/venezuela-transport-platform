# Liquidaciones y reembolsos

Módulo `apps/api/src/modules/settlements`, contratos en
`packages/shared-types/src/api/settlements.ts`. Es el paso 4 del ADR-018: los pasajeros le pagan a
la plataforma, y la plataforma lleva la cuenta de lo que le debe a cada empresa y de los pagos que
le hace. También aquí están la política de comisión y reembolsos, la cancelación de reservas
pagadas y la cola de los pagos por reembolsar. Decisiones: ADR-024 (libro y comisión) y ADR-025
(política editable y cancelaciones).

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
- **Una fila por reserva y tipo** (`kind`: `booking` al pagarse, `cancellation` al cancelarse;
  índice único sobre `booking_id, kind`): una notificación repetida del proveedor no gana dos
  veces y una reserva se cancela una sola vez.
- **Las filas no cambian.** Cambiar la comisión solo afecta a las reservas que se paguen después;
  una cancelación agrega su propia fila, con montos negativos.
- Las reservas confirmadas antes de este módulo no tienen fila (no hay datos de producción).

## La política: comisión y reembolsos

La **política general** (`platform_settings`, una sola fila) la editan los administradores de la
plataforma en **Liquidaciones**. Empieza con:

- **comisión del 8 %** sobre cada boleto (porcentaje de 0 a 100 con hasta dos decimales);
- **tramos de reembolso**: 100 % si el pasajero cancela con al menos 48 h de anticipación, 50 %
  con al menos 2 h, nada después.

Cada empresa puede tener **su propia comisión, sus propios tramos o ambos**
(`organization_policies`); lo que deja vacío usa la política general. Los cambios se aplican desde
ese momento: la comisión de una reserva queda fija al pagarse, y los tramos se leen al cancelar.

Los tramos (1 a 4) van del que pide más horas al que pide menos, con horas enteras de 0 a 720 y
porcentajes enteros. Las horas se cuentan hasta la hora en que el pasajero aborda en su parada.

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

## Cancelar una reserva pagada

El pasajero ve en la app cuánto se le devolvería **antes** de confirmar
(`GET /me/bookings/:id/cancellation`) y cancela con `POST /me/bookings/:id/cancel`, el mismo
endpoint que libera un apartado. En una sola transacción, con la reserva bloqueada:

1. se calcula el porcentaje con los tramos de la empresa y las horas que faltan;
2. la reserva pasa a `cancelled` y sus puestos quedan libres para otros pasajeros;
3. si hay reembolso, el pago pasa a `refund_due` con `refund_amount` (el porcentaje de lo que
   pagó, en su moneda) y entra en la cola de **Reembolsos**;
4. el libro de la empresa recibe una fila `cancellation` negativa.

**La plataforma conserva su comisión** (decisión del dueño del producto): el reembolso se descuenta
de lo que ganó la empresa. Solo si el reembolso es mayor que eso (un reembolso cercano al 100 %),
la diferencia sale de la comisión, para que la empresa nunca quede debiendo por una reserva.
Ejemplo con US$ 100 al 8 %: con 50 % de reembolso el pasajero recibe US$ 50, la plataforma se
queda US$ 8 y la empresa US$ 42; con 100 %, el pasajero recibe US$ 100 y nadie se queda nada.

No se puede cancelar (`409 BOOKING_NOT_CANCELLABLE`) cuando ya salió el autobús o un pasajero de la
reserva abordó. A menos horas que el último tramo se puede cancelar, sin reembolso: el puesto se
libera igual.

Si la empresa ya cobró y luego un pasajero cancela, su saldo puede quedar **negativo**: la empresa
le debe ese monto a la plataforma, que lo descuenta de los pagos siguientes.

## Quién ve qué

| Quién                                                | Ve y hace                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dueño y administrador de la empresa (`finance.view`) | Su saldo, sus reservas pagadas por mes y los pagos recibidos (portal → **Liquidaciones**)          |
| Administrador de la plataforma (`admin`)             | Todo lo anterior para cada empresa, las políticas, registrar y anular pagos, la cola de reembolsos |
| Revisor de la plataforma (`reviewer`)                | Nada de esto: el dinero es solo para los administradores (403)                                     |

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
| `GET /admin/settlement-policy`, `PUT /admin/settlement-policy`  | Administrador  |
| `PUT /admin/organizations/:id/policy`                           | Administrador  |
| `GET /me/bookings/:id/cancellation`                             | El pasajero    |
| `POST /me/bookings/:id/cancel`                                  | El pasajero    |
| `POST /admin/organizations/:id/payouts`                         | Administrador  |
| `POST /admin/payouts/:id/void`                                  | Administrador  |
| `GET /admin/refunds`                                            | Administrador  |
| `POST /admin/refunds/:paymentId`                                | Administrador  |

El mes de `entries` es el calendario venezolano (por defecto, el actual) y se cuenta por la fecha
en que se confirmó el pago. `GET /admin/settlements` lista las empresas de autobuses activas y
cualquier otra con ganancias o pagos.

Eventos de auditoría: `settlement.platform_policy_set`, `settlement.organization_policy_set`,
`booking.cancelled` (con `refundPercent` si estaba pagada), `settlement.payout_created`,
`settlement.payout_voided`, `payment.refunded`.

## Todavía no

Que la empresa cancele un viaje completo y reembolse a todos, comisión sobre los taxis (hoy se pagan directo al conductor), exportar el libro a una hoja de cálculo, y pagar a
las empresas a través de un proveedor en vez de a mano.

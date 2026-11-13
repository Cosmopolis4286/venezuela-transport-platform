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

| Campo             | Valor                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `gross`           | Lo que pagó el pasajero (tarifas + cargo por servicio), en la moneda de la tarifa              |
| `commission_rate` | El cargo por servicio de la reserva (ver abajo)                                                |
| `commission`      | El cargo por servicio: `tarifas × rate / 100`, redondeado hacia arriba en la mitad, a céntimos |
| `earned`          | `gross − commission`: las tarifas completas, lo que gana la empresa                            |

**Cargo por servicio encima de la tarifa (ADR-029, decisión del dueño del producto).** El
pasajero paga la tarifa **más** el cargo por servicio de la plataforma; la empresa gana su tarifa
completa. El porcentaje se fija al **apartar** los puestos (`bookings.service_fee` y
`service_fee_rate`) y se le muestra al pasajero antes de pagar. Las reservas hechas antes de este
cambio no tienen esas columnas y conservan el modelo anterior (la comisión salía de la tarifa).

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

- **cargo por servicio del 15 %** sobre la tarifa, pagado por el pasajero además de ella
  (porcentaje de 0 a 100 con hasta dos decimales; antes de ADR-029 era una comisión del 8 % dentro
  de la tarifa);
- **tramos de reembolso**: 100 % si el pasajero cancela con al menos 48 h de anticipación, 50 %
  con al menos 2 h, nada después;
- **tramos de reembolso suburbanos** (rutas suburbanas de todas las empresas, ADR-028): 100 % con
  24 h o más, 75 % con 2 h o más, 50 % con 30 minutos o más, nada en los últimos 30 minutos.

Cada empresa puede tener **su propio cargo, sus propios tramos (de sus rutas interurbanas) o ambos**
(`organization_policies`); lo que deja vacío usa el de la **zona donde sube el pasajero**
([ADR-028](network.md#zonas-operativas)) y, si tampoco hay, la política general. Los cambios se
aplican desde ese momento: el cargo de una reserva queda fijo al apartarse, y los tramos se leen
al cancelar.

Los tramos (1 a 4) van del que pide más horas al que pide menos, con horas de 0 a 720 en cuartos
de hora (0,5 = 30 minutos) y porcentajes enteros. Las horas se cuentan hasta la hora en que el pasajero aborda en su parada.

## Saldo y pagos a las empresas

El saldo se calcula por moneda:
`ganado − cobrado por la empresa − pagado a la empresa + pagado por la empresa`, donde los pagos
anulados no cuentan. Si cobra la plataforma, «cobrado por la empresa» es cero y el saldo es lo que
la plataforma le debe. Si cobra la empresa (ADR-027), la empresa ya tiene la tarifa: por cada
reserva el saldo baja en la comisión, y un saldo **negativo** es lo que la empresa le debe a la
plataforma. Cada entrada del libro anota quién cobró (`collected_by`); una cancelación copia el de
su reserva.

### Pago a la línea o al conductor (ADR-030)

Cada ruta es **interurbana** o **urbana/suburbana** (`routes.scope`) y dice quién cobra sus
tarifas (`routes.payee_override`; vacío = el valor por defecto): las interurbanas, la empresa; las
urbanas y suburbanas, el **conductor de cada viaje**. Al pagarse la reserva, la entrada del libro
anota `payee` (`organization` o `driver`); si cobra la empresa (ADR-027) siempre es
`organization`, porque ella les paga a sus conductores.

- El conductor se busca por el viaje (`trips.driver_user_id`) al calcular el saldo, así que una
  venta hecha antes de asignar conductor se le acredita al que el despacho asigne. Mientras no hay
  conductor, aparece como «viajes sin conductor asignado».
- Las tarifas de rutas pagadas a conductores no cuentan en el saldo de la empresa
  (`SettlementBalance.forDrivers` las muestra aparte) y la empresa ve el saldo de cada conductor.
- El conductor indica en la app de transportistas (**Mis cobros**) dónde cobrar
  (`driver_payout_accounts`: medio, banco, cuenta o teléfono, cédula y nombre del titular) y ve su
  saldo (`GET /me/earnings`).
- Un administrador le paga desde la liquidación de la empresa (`payouts.driver_user_id`); nunca
  más que su saldo (`409 PAYOUT_EXCEEDS_BALANCE`). Se anula igual que cualquier pago.

Un administrador registra cada transferencia que hace a una empresa (`payouts`): moneda, monto,
medio (transferencia, pago móvil, USDT), referencia y una nota. Reglas:

- Un pago **de la empresa a la plataforma** (su comisión) se registra igual, con
  `direction: from_operator`, y nunca por más de lo que debe (`409 COLLECTION_EXCEEDS_DEBT`).
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

Los reembolsos de lo que cobró una empresa (ADR-027) no aparecen aquí: la empresa los devuelve y
los marca en su portal (**Cobros**, `GET /organizations/:id/refunds`).

## Cancelar una reserva pagada

Cada `Booking` trae `refundPolicy`, los tramos vigentes de su empresa, para que el pasajero los
vea antes de pagar (la app los muestra en la reserva apartada y en la confirmada). El monto exacto
se calcula al cancelar, con los tramos de ese momento.

El pasajero ve en la app cuánto se le devolvería **antes** de confirmar
(`GET /me/bookings/:id/cancellation`) y cancela con `POST /me/bookings/:id/cancel`, el mismo
endpoint que libera un apartado. En una sola transacción, con la reserva bloqueada:

1. se calcula el porcentaje con los tramos de la empresa y las horas que faltan;
2. la reserva pasa a `cancelled` y sus puestos quedan libres para otros pasajeros;
3. si hay reembolso, el pago pasa a `refund_due` con `refund_amount` (el porcentaje de la parte
   del pago que corresponde a las tarifas, en su moneda) y entra en la cola de **Reembolsos**;
4. el libro de la empresa recibe una fila `cancellation` negativa.

**Los tramos se aplican a las tarifas; el cargo por servicio no se reembolsa** (ADR-029): el
reembolso sale entero de lo que ganó la empresa y la plataforma conserva su cargo. Ejemplo con una
tarifa de US$ 100 y 15 %: el pasajero paga US$ 115; con 50 % de reembolso recibe US$ 50, la
empresa se queda US$ 50 y la plataforma US$ 15; con 100 %, recibe US$ 100, la empresa nada y la
plataforma US$ 15. Las reservas anteriores al cargo siguen la regla anterior (el reembolso sale
de lo ganado y, si no alcanza, de la comisión).

No se puede cancelar (`409 BOOKING_NOT_CANCELLABLE`) cuando ya salió el autobús o un pasajero de la
reserva abordó. A menos horas que el último tramo se puede cancelar, sin reembolso: el puesto se
libera igual.

Si la empresa ya cobró y luego un pasajero cancela, su saldo puede quedar **negativo**: la empresa
le debe ese monto a la plataforma, que lo descuenta de los pagos siguientes.

Si la **empresa** cancela la salida completa ([dispatch.md](dispatch.md#cancelar-una-salida)), cada
pasajero recibe el reembolso completo (tarifas **y** cargo por servicio) y la plataforma conserva
su cargo, que asume la empresa: la entrada de cancelación lleva `commission = 0` y descuenta todo
lo pagado de lo ganado.

## Quién ve qué

| Quién                                                  | Ve y hace                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Dueño y administrador de la empresa (`finance.view`)   | Su saldo, sus reservas pagadas por mes y los pagos recibidos (portal → **Liquidaciones**)          |
| Dueño y administrador de la empresa (`finance.manage`) | Si la empresa cobra: sus cuentas, los pagos por verificar y sus reembolsos (portal → **Cobros**)   |
| Administrador de la plataforma (`admin`)               | Todo lo anterior para cada empresa, las políticas, registrar y anular pagos, la cola de reembolsos |
| Revisor de la plataforma (`reviewer`)                  | Nada de esto: el dinero es solo para los administradores (403)                                     |

## Endpoints (`/api/v1`)

| Método y ruta                                                   | Quién            |
| --------------------------------------------------------------- | ---------------- |
| `GET /organizations/:id/settlement`                             | `finance.view`   |
| `GET /organizations/:id/settlement/entries?month=YYYY-MM`       | `finance.view`   |
| `GET /organizations/:id/payouts`                                | `finance.view`   |
| `GET /admin/settlements`                                        | Administrador    |
| `GET /admin/organizations/:id/settlement`                       | Administrador    |
| `GET /admin/organizations/:id/settlement/entries?month=YYYY-MM` | Administrador    |
| `GET /admin/organizations/:id/payouts`                          | Administrador    |
| `GET /admin/settlement-policy`, `PUT /admin/settlement-policy`  | Administrador    |
| `PUT /admin/organizations/:id/policy`                           | Administrador    |
| `GET /me/bookings/:id/cancellation`                             | El pasajero      |
| `POST /me/bookings/:id/cancel`                                  | El pasajero      |
| `POST /admin/organizations/:id/payouts`                         | Administrador    |
| `POST /admin/payouts/:id/void`                                  | Administrador    |
| `GET /admin/refunds`                                            | Administrador    |
| `POST /admin/refunds/:paymentId`                                | Administrador    |
| `GET /organizations/:id/refunds`                                | `finance.manage` |
| `POST /organizations/:id/refunds/:paymentId`                    | `finance.manage` |

El mes de `entries` es el calendario venezolano (por defecto, el actual) y se cuenta por la fecha
en que se confirmó el pago. `GET /admin/settlements` lista las empresas de autobuses activas y
cualquier otra con ganancias o pagos.

Eventos de auditoría: `settlement.platform_policy_set`, `settlement.organization_policy_set`,
`booking.cancelled` (con `refundPercent` si estaba pagada), `settlement.payout_created`,
`settlement.payout_voided`, `payment.refunded`.

## Todavía no

Comisión sobre los taxis (hoy se pagan directo al conductor), exportar el libro a una hoja de cálculo, y pagar a
las empresas a través de un proveedor en vez de a mano.

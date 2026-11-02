# Pagos y boletos

Módulo `apps/api/src/modules/payments`, contratos en `packages/shared-types/src/api/payments.ts`.
Es el paso 3 del ADR-018: el pasajero paga una reserva apartada, la plataforma confirma el pago
(un adaptador automático, o un administrador que lo verifica a mano, ADR-027) y cada puesto recibe
un boleto con un código QR que los inspectores escanean al
abordar. Lo que cada reserva pagada le deja a la empresa (tarifa menos comisión) y la cola de
reembolsos están en [settlements.md](settlements.md).

## Flujo

1. El pasajero aparta puestos ([bookings.md](bookings.md)) y abre la reserva.
2. `GET /me/bookings/:id/payment-options` lista los métodos disponibles, cada uno con el monto ya
   convertido: pago móvil y transferencia bancaria en bolívares, PIX en reales, USDT.
3. El pasajero elige uno: `POST /me/bookings/:id/payments`. El monto y la tasa quedan
   **congelados** en el pago, y el proveedor devuelve las instrucciones (cuenta, teléfono, clave
   PIX, billetera) y una **referencia** como `VTP-7K3QXA-4M` para escribir en el concepto de la
   transferencia. Elegir otro método anula el pago pendiente anterior; una reserva tiene como
   máximo un pago pendiente.
4. El adaptador del proveedor informa que llegó el dinero (`PaymentsService.receive`); con el
   proveedor `manual`, el pasajero informa el número de operación y un administrador lo verifica
   ([abajo](#pagos-verificados-a-mano)). La app consulta cada 5 s.
5. Si la reserva sigue apartada, pasa a `confirmed` y cada pasajero recibe un boleto.

## Tasas de cambio

Cada empresa fija sus propias tasas en el portal (`PUT /organizations/:id/exchange-rates`,
`routes.manage`): bolívares y reales por dólar estadounidense, con hasta cuatro decimales. USDT va
1:1 con el dólar. La conversión pasa por el dólar y redondea hacia arriba en la mitad, a
céntimos, con aritmética entera (`money.ts`). Un método que necesita una tasa que falta no se
ofrece. Con una tarifa en bolívares, el pago móvil y la transferencia no necesitan tasa.

| Método        | Recibe | Tasa necesaria para una tarifa en USD | Para una tarifa en VES |
| ------------- | ------ | ------------------------------------- | ---------------------- |
| Pago móvil    | VES    | VES                                   | ninguna                |
| Transferencia | VES    | VES                                   | ninguna                |
| PIX           | BRL    | BRL                                   | VES y BRL              |
| USDT          | USDT   | ninguna                               | VES                    |

## Estados de un pago

| Estado       | Significado                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------- |
| `pending`    | Esperando el dinero; vence con el apartado de la reserva                                      |
| `reported`   | (manual) El pasajero dice que pagó y dio el número de operación; espera la verificación       |
| `confirmed`  | Llegó a tiempo; la reserva queda confirmada                                                   |
| `rejected`   | (manual) El administrador no encontró el dinero; el pasajero ve el motivo y puede reintentar  |
| `cancelled`  | Reemplazado por otro método, o la reserva se canceló o venció antes de que llegara el dinero  |
| `refund_due` | Llegó dinero para una reserva que ya no se puede confirmar, o llegó de menos o en otra moneda |
| `refunded`   | Un administrador de la plataforma devolvió un pago `refund_due` (con su referencia)           |

Un pago `confirmed` también pasa a `refund_due` cuando el pasajero cancela la reserva con derecho a
reembolso; entonces `refundAmount` dice cuánto se devuelve (una parte de lo pagado, ver
[settlements.md](settlements.md)).

Reglas:

- **Unos segundos tarde no importa:** el dinero de un apartado vencido todavía confirma la reserva
  mientras sus puestos no se hayan liberado (nadie más puede apartarlos antes de eso). Los bloqueos
  de fila ordenan la confirmación y la liberación de apartados vencidos.
- El dinero de un pago anulado, o de menos, queda como `refund_due` y nunca confirma la reserva.
  Pagar de más la confirma. Los reembolsos se hacen a mano y se registran en **Reembolsos**
  ([settlements.md](settlements.md)).
- Confirmar una reserva escribe, en la misma transacción, lo que gana la empresa.
- `receive` es idempotente: una notificación repetida no cambia nada.
- Los pagos pendientes de reservas canceladas o vencidas se anulan al vuelo, igual que los
  apartados vencidos.
- El pasajero puede cancelar una reserva pagada hasta abordar; el reembolso sigue la política de
  la empresa ([settlements.md](settlements.md#cancelar-una-reserva-pagada)).
- Confirmar un pago avisa al pasajero por push y correo ([notifications.md](notifications.md)).

## Proveedores

`PaymentProvider` (`payment-provider.ts`) es la interfaz de los adaptadores: qué métodos admite y
las instrucciones para un pago. Los adaptadores reales (un banco o pasarela venezolana, una
institución PIX, un vigilante de billetera USDT) recibirán webhooks o consultarán, y luego
llamarán a `PaymentsService.receive` con la referencia, el monto y su propio id de transacción.
Sus credenciales van en variables de entorno.

`PAYMENT_PROVIDER` elige qué corre hoy:

| Valor       | Por defecto         | Comportamiento                                                                                                                   |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `simulated` | fuera de producción | Cuentas ficticias (`Banco Simulado`, `…SIMULADO…`); `POST /me/payments/:id/simulate` informa el dinero (pruebas, demostraciones) |
| `manual`    | en producción       | Las cuentas de cobro de la plataforma; el pasajero informa el número de operación y un administrador verifica (ADR-027)          |
| `disabled`  | —                   | No se ofrece ningún método; los apartados simplemente vencen                                                                     |

La configuración **rechaza `simulated` en producción**, y el endpoint de simulación responde 404
siempre que el simulador está apagado.

## Pagos verificados a mano

Con `PAYMENT_PROVIDER=manual` (ADR-027):

1. Un administrador carga las **cuentas de cobro** en **Pagos** (`PUT /admin/payment-accounts/:method`):
   banco, teléfono y RIF para pago móvil; banco, cuenta, titular y RIF para transferencia; clave
   y favorecido para PIX; red y dirección para USDT. Solo se ofrecen los métodos con una cuenta
   **activa**.
2. El pasajero elige el método y ve esos datos, el monto y el **concepto** (`VTP-7K3QXA-4M`).
3. Paga en su banco y toca **Ya pagué** con el número de operación
   (`POST /me/payments/:id/report`): el pago pasa a `reported` y los puestos quedan apartados
   hasta `PAYMENT_REVIEW_HOLD_HOURS` (6) horas, nunca después de la salida. Mientras tanto no se
   puede empezar otro pago (`409 PAYMENT_UNDER_REVIEW`). Un pago anulado porque el apartado venció
   también se puede informar: si el dinero llegó, se reembolsa.
4. El administrador ve la cola en **Pagos** (`GET /admin/payments/review`, los más antiguos
   primero) y busca el pago en el banco:
   - **Confirmar** (`POST /admin/payments/:id/confirm`, con el monto que llegó si es distinto):
     llama a `receive` como un adaptador. Si la reserva sigue apartada y el monto alcanza, queda
     confirmada; si no, el pago queda `refund_due`.
   - **Rechazar** (`POST /admin/payments/:id/reject`, con el motivo): el pago queda `rejected`, el
     pasajero recibe el motivo por push y correo y un apartado nuevo de `BOOKING_HOLD_MINUTES`
     para volver a intentarlo.

Solo los administradores de la plataforma ven las cuentas y la cola (es dinero). Eventos de
auditoría: `payment.reported`, `payment.verified`, `payment.rejected`, `payment_account.saved`,
`payment_account.removed`.

## Boletos

Una reserva confirmada devuelve `ticket: { qr, boardedAt }` por cada pasajero. El contenido del QR
es `VTP1.<id del boleto>`: un id aleatorio imposible de adivinar, así que el código no lleva datos
personales ni necesita un secreto. La app de pasajeros lo dibuja con vistas simples
(`qrcode-generator`, sin módulo nativo).

Los inspectores lo escanean con la app de transportistas (**Validar boletos**), que llama a
`POST /organizations/:id/tickets/validate` con `tickets.validate` (dueño, administrador,
inspector). El cuerpo es `{ qr }`, o `{ bookingCode, seatNumber }` escritos a mano cuando no se
puede leer la pantalla del pasajero (el código se acepta con o sin `VTP-`, en mayúsculas o
minúsculas). Un boleto de otra organización, o uno que no existe, da 404. En los demás casos la
respuesta dice qué hacer, con el nombre, el documento, el puesto y el tramo del pasajero:

| `result`          | Significado                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `boarded`         | Válido: el pasajero puede abordar; queda marcado como abordado   |
| `already_boarded` | Ya se usó (`boardedAt` dice cuándo): un QR copiado o reutilizado |
| `not_paid`        | La reserva está apartada, cancelada o vencida                    |
| `other_departure` | El pasajero aborda a más de **12 horas** de ahora                |

Solo la primera validación válida marca el abordaje. La lista de pasajeros muestra la hora de
abordaje.

## Endpoints (`/api/v1`)

| Método y ruta                                 | Quién                                             |
| --------------------------------------------- | ------------------------------------------------- |
| `GET /me/bookings/:id/payment-options`        | El dueño de la reserva, mientras está apartada    |
| `POST /me/bookings/:id/payments`              | El dueño de la reserva, mientras está apartada    |
| `POST /me/payments/:id/simulate`              | El dueño del pago; solo con el proveedor simulado |
| `POST /me/payments/:id/report`                | El dueño del pago; solo con el proveedor manual   |
| `GET /admin/payment-accounts`                 | Administradores de la plataforma                  |
| `PUT, DELETE /admin/payment-accounts/:method` | Administradores de la plataforma                  |
| `GET /admin/payments/review`                  | Administradores de la plataforma                  |
| `POST /admin/payments/:id/confirm`            | Administradores de la plataforma                  |
| `POST /admin/payments/:id/reject`             | Administradores de la plataforma                  |
| `GET /organizations/:id/exchange-rates`       | Miembros                                          |
| `PUT /organizations/:id/exchange-rates`       | `routes.manage`                                   |
| `POST /organizations/:id/tickets/validate`    | `tickets.validate`                                |

Eventos de auditoría: `payment.created`, `payment.confirmed`, `payment.refund_due`,
`exchange_rates.replaced`, `ticket.boarded`.

## Todavía no

Adaptadores de proveedores reales (primero contratos y revisión legal, ver ADR-018), el cobro con
las cuentas de cada empresa (segundo paso del ADR-027) y la validación sin conexión.

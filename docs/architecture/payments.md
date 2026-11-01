# Pagos y boletos

Módulo `apps/api/src/modules/payments`, contratos en `packages/shared-types/src/api/payments.ts`.
Es el paso 3 del ADR-018: el pasajero paga una reserva apartada, la plataforma confirma el pago
automáticamente y cada puesto recibe un boleto con un código QR que los inspectores escanean al
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
4. El adaptador del proveedor informa que llegó el dinero (`PaymentsService.receive`). La app
   consulta cada 5 s.
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
| `confirmed`  | Llegó a tiempo; la reserva queda confirmada                                                   |
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
| `disabled`  | en producción       | No se ofrece ningún método; los apartados simplemente vencen                                                                     |

La configuración **rechaza `simulated` en producción**, y el endpoint de simulación responde 404
siempre que el simulador está apagado.

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

| Método y ruta                              | Quién                                             |
| ------------------------------------------ | ------------------------------------------------- |
| `GET /me/bookings/:id/payment-options`     | El dueño de la reserva, mientras está apartada    |
| `POST /me/bookings/:id/payments`           | El dueño de la reserva, mientras está apartada    |
| `POST /me/payments/:id/simulate`           | El dueño del pago; solo con el proveedor simulado |
| `GET /organizations/:id/exchange-rates`    | Miembros                                          |
| `PUT /organizations/:id/exchange-rates`    | `routes.manage`                                   |
| `POST /organizations/:id/tickets/validate` | `tickets.validate`                                |

Eventos de auditoría: `payment.created`, `payment.confirmed`, `payment.refund_due`,
`exchange_rates.replaced`, `ticket.boarded`.

## Todavía no

Adaptadores de proveedores reales (primero contratos y revisión legal, ver ADR-018) y la validación
sin conexión.

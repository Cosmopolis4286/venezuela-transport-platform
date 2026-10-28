# Reservas: viajes y puestos apartados

Módulo `apps/api/src/modules/bookings`, contratos en `packages/shared-types/src/api/bookings.ts`.
Es el paso 2 del ADR-018: los pasajeros eligen puestos y los apartan. El pago, que confirma la
reserva y emite los boletos, se describe en [payments.md](payments.md).

## Conceptos

| Concepto     | Notas                                                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Viaje**    | Un horario en una fecha de servicio (el día en que el vehículo sale del origen de la ruta). Se crea con la primera reserva, con una **copia del mapa de puestos** y la capacidad, así que editar el mapa después nunca mueve un puesto vendido. |
| **Reserva**  | Los puestos de una persona en un viaje entre dos paradas. Tiene un código como `VTP-7K3QXA`, la tarifa por pasajero y el total congelados al reservar, y las horas de abordaje y llegada de su tramo.                                           |
| **Pasajero** | Una fila por puesto: nombre, tipo y número de documento.                                                                                                                                                                                        |

Estados de una reserva: `held` (puestos apartados hasta `expiresAt`, esperando el pago) →
`confirmed` (pagada, con un boleto por puesto, ver [payments.md](payments.md)), `cancelled`
(cancelada por el pasajero) o `expired` (se venció el apartado).

## Reglas

- Un puesto queda **ocupado durante todo el viaje**, sea cual sea el tramo del pasajero. Es
  simple y seguro; revender un puesto liberado en una parada intermedia es una mejora futura.
- Los apartados duran `BOOKING_HOLD_MINUTES` (15 por defecto). Hasta 6 puestos por reserva y 3
  apartados sin pagar por persona a la vez, para que no se acaparen puestos.
- Solo se pueden reservar salidas publicadas: horario, ruta y organización activos, una tarifa
  para el par de paradas y una hora de abordaje todavía futura.
- **Sin doble venta:** un índice único parcial sobre `(viaje, puesto)` de los pasajeros activos
  rechaza un segundo apartado del mismo puesto, incluso cuando dos solicitudes llegan al mismo
  tiempo (probado). La que pierde recibe `409` y un mensaje para elegir otro puesto.
- Los apartados vencidos se liberan al vuelo: las lecturas solo cuentan reservas confirmadas y
  apartados vigentes, y los puestos de los apartados vencidos se liberan antes de tomar puestos
  nuevos.
- Un horario con viajes no se puede borrar (se pausa).
- La búsqueda de salidas devuelve `seatsAvailable` por salida.

## Endpoints (`/api/v1`)

| Método y ruta                                                              | Quién                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /trips/availability?scheduleId=&serviceDate=&from=&to=`               | Público — mapa de puestos, puestos ocupados, tarifa, si se puede reservar              |
| `POST /bookings`                                                           | Con sesión — apartar puestos                                                           |
| `GET /me/bookings`, `GET /me/bookings/:id`, `POST /me/bookings/:id/cancel` | El dueño de la reserva                                                                 |
| `GET /organizations/:id/trips?date=`                                       | `bookings.view` (dueño, administrador, despachador, taquillero, inspector)             |
| `GET /organizations/:id/trips/:tripId/manifest`                            | `bookings.view` — lista de pasajeros con nombres, documentos y hora de abordaje        |
| `POST /organizations/:id/tickets/validate`                                 | `tickets.validate` — validar un boleto al abordar ([payments.md](payments.md#boletos)) |

Eventos de auditoría: `booking.held`, `booking.cancelled`.

## Privacidad

La lista de pasajeros contiene nombres y números de documento. Solo la ven los roles que la
necesitan para el abordaje (`bookings.view`); los conductores no. Los endpoints de reservas nunca
devuelven las reservas de otro usuario.

## Todavía no

Cancelación de reservas pagadas con reembolso, cancelación de un viaje por la empresa y venta de
puestos por tramo.

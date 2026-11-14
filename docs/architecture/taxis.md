# Taxis desde y hacia los terminales

Módulo `apps/api/src/modules/taxi`, contratos en `packages/shared-types/src/api/taxi.ts`. Un
pasajero pide un taxi para salir de un terminal o para llegar a él; las líneas de taxi que operan
ahí ven la solicitud, y la primera que la toma se queda con el viaje.

## Cómo funciona

1. **La línea elige sus terminales** en el portal (**Taxis → Terminales donde opera la línea**,
   `routes.manage`). Solo ve las solicitudes de esos terminales.
2. **El pasajero pide** en la app (`POST /me/taxi-rides`): el terminal, si va **desde** o
   **hacia** él, la dirección del otro extremo, cuántos pasajeros son, notas y un teléfono de
   contacto (por defecto, el verificado de su cuenta). Solo se ofrecen los terminales con al menos
   una línea activa (`GET /taxi/terminals`, público).
3. **Una línea la toma**, de dos maneras:
   - un **conductor** desde la app de transportistas (`POST /me/taxi/rides/:id/accept`), con su
     vehículo y la tarifa;
   - un **despachador** desde el portal (`POST /organizations/:id/taxi/rides/:id/assign`), que
     elige a un conductor libre y un vehículo.

   Tomarla es atómico: si dos lo intentan a la vez, uno gana y el otro recibe `409`.

4. **El pasajero ve** la placa, el nombre y el teléfono verificado del conductor, la línea y la
   tarifa. Su app consulta cada 5 segundos.
5. **El conductor** marca "Pasajero a bordo" (`pickup`) y "Terminar viaje" (`complete`).

| Estado        | Significado                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `requested`   | Esperando un taxi, hasta `TAXI_REQUEST_MINUTES` (20 minutos)               |
| `accepted`    | Una línea la tomó: conductor, vehículo y tarifa fijados                    |
| `in_progress` | El pasajero va a bordo                                                     |
| `completed`   | Terminado                                                                  |
| `cancelled`   | El pasajero lo canceló antes de subir                                      |
| `expired`     | Nadie la tomó a tiempo; las solicitudes vencidas se marcan al leer o tomar |

Una línea o su conductor pueden **liberar** un viaje aceptado que todavía no empezó ("No puedo
hacer este viaje"): vuelve a `requested` con 20 minutos nuevos, para que lo tome otro taxi.

## Reglas

- Un pasajero tiene **un solo taxi abierto** a la vez; un conductor y un vehículo, **un solo viaje
  activo**. Las garantizan índices únicos parciales de la base de datos, así que se cumplen aunque
  lleguen solicitudes simultáneas.
- El conductor es un miembro de la línea cuyo rol conduce (`trips.drive`); el vehículo es de la
  línea y está activo ([flota](fleet.md#vehículos)). La línea debe estar activa.
- Nadie toma su propia solicitud.
- La tarifa la fija la línea al tomar el viaje (mayor que cero, en US$ o Bs.). **Por ahora el
  pasajero le paga directamente al conductor**; cobrar los taxis dentro de la plataforma es una
  decisión pendiente.

## Avisos

Al pedir un taxi, los conductores de las líneas activas que operan en ese terminal reciben un push
en la app de transportistas; cuando una línea la toma, el pasajero recibe un push con la placa y la
tarifa ([notifications.md](notifications.md)). Las pantallas siguen consultando cada pocos
segundos para mostrar el estado.

## Privacidad

Antes de tomar una solicitud, los conductores y despachadores solo ven el terminal, la dirección,
cuántos pasajeros son, las notas y el nombre de pila del pasajero. El teléfono de contacto y el
apellido aparecen solo para la línea que tomó el viaje. El pasajero ve el teléfono del conductor
solo si está verificado.

## Endpoints (`/api/v1`)

| Método y ruta                                                           | Quién                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `GET /taxi/terminals`                                                   | Público                                        |
| `POST /me/taxi-rides`, `GET /me/taxi-rides`, `GET …/:id`                | Con sesión — los taxis del pasajero            |
| `POST /me/taxi-rides/:id/cancel`                                        | El pasajero, antes de subir                    |
| `GET /me/taxi`                                                          | Conductores: su viaje actual y las solicitudes |
| `POST /me/taxi/rides/:id/accept`, `…/pickup`, `…/complete`, `…/release` | El conductor                                   |
| `GET`/`PUT /organizations/:id/taxi/terminals`                           | Miembros / `routes.manage`                     |
| `GET /organizations/:id/taxi`                                           | `operations.dispatch` — tablero de la línea    |
| `POST /organizations/:id/taxi/rides/:id/assign`, `…/release`            | `operations.dispatch`                          |
| `POST /me/taxi-rides/:id/rate`                                          | El pasajero, una vez, con el viaje terminado   |
| `POST`/`GET /admin/taxi-rides`                                          | Personal (`reviewer`): pedidos por WhatsApp    |
| `GET /taxi/track/:token`, `POST …/cancel`, `POST …/rate`                | Público, con el enlace (límite por IP)         |

Eventos de auditoría: `taxi_ride.requested`, `.accepted`, `.picked_up`, `.completed`,
`.cancelled`, `.released`, `taxi_terminals.replaced`, `taxi_ride.requested_for_whatsapp`,
`taxi_ride.cancelled_from_link`.

## Viajes por tramo, bajo demanda (ADR-035)

Además de los taxis de terminal, un pasajero pide un **taxi o una moto entre dos paradas de una
zona activa** (`taxi_rides.kind = 'stretch'`), **ahora o para una hora** (hasta 7
días adelante):

- Escribe la dirección de recogida **cerca de la parada de origen** (sin mapa ni GPS: la línea
  decide si llega). Una moto lleva un pasajero.
- Cada línea de taxis o de mototaxis publica sus **tarifas fijas por tramo** (`on_demand_fares`,
  en los dos sentidos, en su propio tipo de vehículo; portal → Taxis o Mototaxis). El pasajero ve
  antes de pedir el rango de tarifas por vehículo (`GET /taxi/stretch-options`), y la línea que
  toma el viaje cobra la suya: el conductor no escribe la tarifa.
- Solo las líneas con tarifa para ese tramo y vehículo ven la solicitud (y reciben el aviso). Un
  viaje programado se ofrece **desde que se pide** y vence 20 minutos después de la hora pedida si
  nadie lo toma.
- Un viaje **programado y aceptado no ocupa** al conductor ni al vehículo hasta que recoge al
  pasajero: el conductor sigue tomando viajes para ahora, y en su app aparece en "Viajes
  programados". El tablero lo muestra como su viaje actual desde 30 minutos antes.
- Si la zona se pausa (ADR-028), no se piden viajes nuevos (`ZONE_NOT_ACTIVE`) y no se muestran
  las tarifas.
- Se paga **al conductor** o **con un paquete de viajes** del tramo y vehículo (`tripPackId`):
  - pedir el viaje gasta un viaje del paquete por pasajero (en la misma transacción);
  - los viajes vuelven al paquete si nadie toma la solicitud o si el pasajero cancela (siempre;
    una cancelación tardía cuesta la tasa de abajo, ADR-036);
  - solo las líneas que **aceptan paquetes** (política de la empresa) ven y toman esos viajes, y
    el conductor ve "Pagado con paquete" (no cobra);
  - el pasajero ve un **código de recogida** de 4 dígitos (`pickupCode`) y el conductor debe
    escribirlo para iniciar el viaje (`POST …/pickup` con `pickupCode`); tras 5 intentos
    equivocados se bloquea (`TAXI_PICKUP_CODE_LOCKED`). Así una línea no puede cobrarle a la
    plataforma viajes de paquete que no hizo;
  - al terminar el viaje, la línea gana su tarifa del tramo (sin comisión, ADR-029; hasta el tope
    por viaje del paquete): una entrada del
    libro de liquidaciones con `taxi_ride_id` (código `TAXI-…` en sus movimientos).

### Cancelar un viaje que una línea ya tomó (ADR-036)

- **Gratis** antes de que una línea lo tome, durante los primeros **3 minutos** después de que lo
  toma y, en un viaje programado, hasta **30 minutos antes** de la hora pedida. Los minutos y el
  porcentaje los fija un administrador en Liquidaciones → Política general
  (`platform_settings.ride_free_cancel_minutes`, `ride_cancel_fee_percent`).
- Después, el pasajero debe una **tasa del 50 % de la tarifa de la línea**
  (`ride_cancellation_fees`), pague en efectivo o con paquete (el viaje del paquete vuelve igual).
  La app le muestra hasta qué hora cancela gratis y cuánto costaría después
  (`freeCancellationUntil`, `lateCancellationFee`).
- La tasa se paga **en efectivo al conductor de su próximo viaje** de taxi o moto (por tramo o de
  terminal): la ve antes de pedir (`GET /me/taxi-fees`) y en el viaje (`feesDue`); el conductor y
  el despachador la ven en la solicitud. Al terminar ese viaje la tasa queda cobrada.
- La tasa es de **la línea que salió a buscarlo**. En el libro, filas `ride_cancellation_fee` con
  el `taxi_ride_id` del viaje cancelado: si la cobró la misma línea, una fila cobrada por ella
  (no debe nada); si la cobró otra, la primera gana la tasa completa (cobrada por la plataforma;
  sin comisión desde el ADR-029) y la segunda tiene una fila cobrada por ella sin ganancia, que le resta la
  tasa de su saldo.
- **Si el conductor se retrasa**, cancelar vuelve a ser gratis: no hay tasa si no lo recogió
  20 minutos después de tomarlo o de la hora pedida (`RIDE_PICKUP_GRACE_MINUTES`,
  `lateCancellationEndsAt`). No hay estado "llegué": es la forma simple de no cobrarle al
  pasajero cuando el conductor no aparece.
- **Viajes abandonados**: un viaje tomado que no se recoge en 2 horas (desde que se tomó o desde la
  hora pedida) se cancela solo, sin tasa y devolviendo los viajes del paquete; uno en curso que
  no se termina en 6 horas se da por terminado (con su ganancia y sus tasas). Así el pasajero no
  queda bloqueado (`RIDE_ABANDONED_HOURS`).
- Si el pasajero no paga la tasa, el conductor termina con **Terminar sin cobrar la tasa**
  (`POST …/complete` con `feesCollected: false`): queda pendiente para el siguiente viaje y a su
  línea no se le descuenta.
- Si el pasajero no vuelve a pedir un viaje, la tasa queda pendiente (no hay cobro forzoso).

| Método y ruta                                     | Quién                          |
| ------------------------------------------------- | ------------------------------ |
| `GET /taxi/stretch-options?from=&to=`             | Público — tarifas por vehículo |
| `GET /me/taxi-fees`                               | El pasajero — tasas pendientes |
| `GET`/`PUT /organizations/:id/taxi/stretch-fares` | Miembros / `routes.manage`     |

## Calificaciones

Al terminar un viaje (de terminal o por tramo), el pasajero lo califica una sola vez, de 1 a 5
estrellas con un comentario opcional, desde la app (`POST /me/taxi-rides/:id/rate`) o desde el
enlace de WhatsApp. La línea ve la calificación en su tablero. Un segundo intento o un viaje sin
terminar responden `409 TAXI_RIDE_WRONG_STEP`.

## Pedidos por WhatsApp (ADR-037)

Para quien escribe al WhatsApp de soporte y no usa la app:

1. El personal (rol `reviewer` o superior) llena **Administración → Taxis por WhatsApp**
   (`POST /admin/taxi-rides`): nombre y teléfono del cliente y el viaje, que puede ser **por
   tramo** (dos paradas de una zona, taxi o moto, con la tarifa fija de la línea) o **desde o
   hacia un terminal**. La API crea un usuario **invitado** con ese nombre (ADR-034) y pide el
   viaje por él con las mismas reglas que la app (la moto lleva a uno; los paquetes de viajes son
   solo de la app). El viaje queda `channel = 'whatsapp'` con un `tracking_token` aleatorio.
2. Los conductores lo ven y lo toman como cualquier otro pedido.
3. En la lista (`GET /admin/taxi-rides`, últimas 48 horas, se actualiza cada 20 segundos) el botón
   **Escribirle por WhatsApp** abre el chat con el mensaje del estado: el enlace de seguimiento al
   pedirlo, la placa, el conductor y la tarifa cuando lo toman, el enlace para calificar al
   terminar (`apps/web/src/lib/taxi-whatsapp.ts`).
4. El cliente abre `https://DOMINIO/taxi/<token>` (la web lo lleva a su idioma), sin cuenta: ve el
   estado, la placa, el nombre de pila del conductor, la línea y la tarifa; puede **cancelar**
   antes de que lo recojan (con las mismas reglas y tasa por cancelar tarde que en la app,
   ADR-036) y **calificar** al terminar. No ve teléfonos. El enlace deja de funcionar a los
   `TAXI_TRACKING_DAYS` (7) días.

## Todavía no

Cobro del taxi dentro de la plataforma, tarifas fijas por zona para los taxis de terminal,
ubicación en vivo del taxi y del pasajero en un mapa, avisos push de cada cambio de estado (hoy:
solicitud nueva y aceptada), recordatorio al conductor antes de un viaje programado y avisos
automáticos por WhatsApp (los manda el personal con un toque).

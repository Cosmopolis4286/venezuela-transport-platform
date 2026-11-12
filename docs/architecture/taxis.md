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

Eventos de auditoría: `taxi_ride.requested`, `.accepted`, `.picked_up`, `.completed`,
`.cancelled`, `.released`, `taxi_terminals.replaced`.

## Todavía no

Cobro del taxi dentro de la plataforma, tarifas fijas por zona, ubicación en vivo del taxi y del
pasajero en un mapa, avisos push de cada cambio de estado (hoy: solicitud nueva y aceptada),
calificaciones y viajes
que no pasan por un terminal.

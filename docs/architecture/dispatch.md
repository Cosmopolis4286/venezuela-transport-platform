# Despacho: vehículos y conductores de cada viaje

Módulo `apps/api/src/modules/dispatch`, contratos en `packages/shared-types/src/api/dispatch.ts`.
Los despachadores asignan un **vehículo** ([flota](fleet.md#vehículos)) y un **conductor** a cada
salida, y los conductores ven en la app de transportistas los viajes que les tocan y quién viaja.
Los taxis desde y hacia los terminales funcionan aparte, por solicitud: ver [taxis](taxis.md).

## Tablero del día

`GET /organizations/:id/dispatch?date=` (`operations.dispatch`: dueño, administrador,
despachador) devuelve **todas** las salidas de la organización ese día, calculadas desde sus
horarios publicados, tengan reservas o no:

- hora de salida del origen y de llegada a la última parada;
- puestos vendidos y apartados, y el mapa de puestos de la salida;
- el vehículo y el conductor asignados (o ninguno);
- los vehículos activos y los conductores que se pueden asignar.

Una salida con reservas aparece aunque después se haya pausado su horario. La fecha puede ir de 7
días atrás a 180 días adelante.

## Asignar

`PUT /organizations/:id/dispatch/assignment` con `{ scheduleId, serviceDate, vehicleId,
driverUserId }`; `null` quita el vehículo o el conductor. Si nadie ha reservado la salida todavía,
se crea su viaje ([reservas](bookings.md)) con la copia del mapa de puestos, igual que en la
primera reserva. Reglas:

- El vehículo es de la organización y está **activo**.
- Si el vehículo y la salida tienen mapa de puestos, deben ser **el mismo**: los pasajeros
  eligieron sus puestos en ese mapa. Un vehículo sin mapa sirve para cualquier salida.
- El conductor es un miembro cuyo rol conduce (`trips.drive`: conductor o dueño).
- **Nadie está en dos viajes a la vez:** ni el vehículo ni el conductor pueden tener otro viaje
  cuyo horario (salida del origen → llegada a la última parada) se cruce con este. El conductor
  se revisa en todas sus organizaciones. Un bloqueo por vehículo y por conductor ordena las
  asignaciones simultáneas.
- Solo viajes desde ayer en adelante, y no cancelados.

Cada asignación queda en la auditoría como `trip.assigned`. Los viajes del portal y la lista de
pasajeros muestran el vehículo y el conductor.

## Los conductores

- `GET /me/driving`: los viajes asignados al usuario, desde los que llegaron hace menos de 12
  horas, mientras siga siendo un miembro que conduce en esa organización. Cada uno trae la
  empresa, la ruta, el origen y el destino, las horas, el vehículo y los puestos ocupados.
- `GET /me/driving/:tripId/passengers`: quién sube y baja en cada parada, con su puesto, si la
  reserva está pagada y si ya abordó. **Sin números de documento**: esos los ven solo los roles
  con `bookings.view`, que revisan los documentos al abordar.

Un viaje de otro conductor, o de una organización de la que ya no conduce, da 404.

## Endpoints (`/api/v1`)

| Método y ruta                                | Quién                                  |
| -------------------------------------------- | -------------------------------------- |
| `GET /organizations/:id/vehicles`            | Miembros                               |
| `POST`/`PATCH /organizations/:id/vehicles…`  | `fleet.manage`                         |
| `GET /organizations/:id/dispatch?date=`      | `operations.dispatch`                  |
| `PUT /organizations/:id/dispatch/assignment` | `operations.dispatch`                  |
| `GET /me/driving`                            | Con sesión — sus viajes como conductor |
| `GET /me/driving/:tripId/passengers`         | El conductor asignado                  |

## Todavía no

Documentos de los vehículos (registro, póliza) con vencimiento, avisos al conductor cuando le
asignan un viaje, que el conductor marque la salida y la llegada, y ubicación en tiempo real.

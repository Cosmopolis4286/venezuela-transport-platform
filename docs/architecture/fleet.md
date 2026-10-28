# Flota: mapas de puestos y vehículos

Módulo `apps/api/src/modules/fleet`, contratos en `packages/shared-types/src/api/fleet.ts`. Los
pasajeros eligen un puesto numerado en un mapa del bus, como lo harían en la taquilla, y cada
empresa registra los vehículos que asigna a sus salidas ([despacho](dispatch.md)).

## Mapas de puestos

Un **mapa de puestos** (seat layout) es la distribución de un tipo de vehículo que opera una
empresa: una cuadrícula por piso (uno o dos pisos, hasta 20 filas y 6 columnas, hasta 100
puestos). Las celdas sin puesto son pasillo o espacio vacío. Cada puesto tiene un número impreso
(1–4 letras o dígitos).

- Las empresas de autobuses y las líneas de taxis administran sus propios mapas con el permiso
  `fleet.manage` (dueño, administrador). Cualquier miembro puede verlos; otras organizaciones
  reciben 404.
- Plantillas para empezar: autobús 2-2 (44), buscama 2-1 (30), dos pisos (60), carro por puesto
  (4). El editor web renumera los puestos de adelante hacia atrás después de cada cambio.
- La validación está en `layoutProblem()` (compartida por la API y el editor, con mensajes en
  español): puestos dentro de la cuadrícula, un puesto por celda, números únicos.

## Horarios y capacidad

Un horario puede usar un mapa (`seatLayoutId`). Su `seats` es entonces la capacidad del mapa, y
editar el mapa actualiza todos los horarios que lo usan. Un horario sin mapa conserva un número
simple de puestos. Un mapa en uso no se puede borrar.

Cada viaje guarda una copia de su mapa desde su primera reserva ([reservas](bookings.md)), así que
editar un mapa nunca mueve un puesto ya vendido.

## Vehículos

Un **vehículo** es una unidad de la empresa: su **placa** (de 5 a 8 letras o cifras, guardada sin
espacios ni guiones y en mayúsculas, única dentro de la organización), un nombre interno opcional
("Unidad 12") y, si se quiere, el **mapa de puestos** que tiene. Un vehículo con mapa solo se
asigna a salidas vendidas con ese mapa; uno sin mapa, a cualquiera.

Los vehículos no se borran: se **desactivan**. Uno inactivo conserva sus viajes pasados pero no se
puede asignar de nuevo. Los administra `fleet.manage` en el portal (**Vehículos**); cualquier
miembro puede verlos.

## Endpoints (`/api/v1`)

| Método y ruta                                                         | Quién          |
| --------------------------------------------------------------------- | -------------- |
| `GET /organizations/:id/seat-layouts`, `GET …/seat-layouts/:layoutId` | Miembros       |
| `POST …/seat-layouts`, `PATCH`/`DELETE …/seat-layouts/:layoutId`      | `fleet.manage` |
| `GET /organizations/:id/vehicles`                                     | Miembros       |
| `POST …/vehicles`, `PATCH …/vehicles/:vehicleId`                      | `fleet.manage` |

Eventos de auditoría: `seat_layout.created`, `.updated`, `.deleted`; `vehicle.created`,
`vehicle.updated`.

## Todavía no

Documentos de los vehículos (registro, póliza) con fecha de vencimiento.

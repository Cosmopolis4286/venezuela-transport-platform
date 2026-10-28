# Flota: mapas de puestos

Módulo `apps/api/src/modules/fleet`, contratos en `packages/shared-types/src/api/fleet.ts`. Los
pasajeros eligen un puesto numerado en un mapa del bus, como lo harían en la taquilla.

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

## Endpoints (`/api/v1`)

| Método y ruta                                                         | Quién          |
| --------------------------------------------------------------------- | -------------- |
| `GET /organizations/:id/seat-layouts`, `GET …/seat-layouts/:layoutId` | Miembros       |
| `POST …/seat-layouts`, `PATCH`/`DELETE …/seat-layouts/:layoutId`      | `fleet.manage` |

Eventos de auditoría: `seat_layout.created`, `.updated`, `.deleted`.

## Todavía no

Los vehículos (placas, documentos) y la asignación de un vehículo y un conductor a cada viaje
llegan con el despacho.

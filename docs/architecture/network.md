# Red de transporte: paradas, rutas, tarifas y horarios

Módulo `apps/api/src/modules/network`, contratos en `packages/shared-types/src/api/network.ts`. La
red es lo que buscan los pasajeros: qué empresa va de dónde a dónde, cuándo y a qué precio. Las
reservas, los puestos y el despacho se construyen sobre ella.

## Conceptos

| Concepto    | Dueño                                 | Notas                                                                                                |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Parada**  | Personal de la plataforma (catálogo)  | `terminal` o `stop` (parada en la vía); nombre, ciudad, estado, dirección opcional y un punto WGS 84 |
| **Ruta**    | Empresa de autobuses o línea de taxis | Paradas ordenadas (2–40) con el tiempo de viaje desde el origen; `draft` → `active` ⇄ `inactive`     |
| **Tarifa**  | Ruta                                  | Precio entre dos paradas en el orden del viaje, en `USD` o `VES`; puede haber pares sin tarifa       |
| **Horario** | Ruta                                  | Salida recurrente desde el origen: hora local, días de la semana, fechas de vigencia, clase, puestos |
| **Salida**  | Se calcula, no se guarda              | Un horario en una fecha, visto desde la parada donde aborda el pasajero                              |

- **Las paradas son compartidas.** Todas las empresas usan el mismo "Terminal La Bandera", así los
  pasajeros pueden buscar entre empresas. Las empresas le piden al personal de la plataforma las
  paradas que falten. Una parada puede vincularse a la organización de terminal que la opera. Los
  nombres son únicos por ciudad (sin distinguir mayúsculas).
- **Las líneas de taxis también publican rutas** (servicios por puesto entre ciudades); los
  terminales no.
- **Las horas son hora de Venezuela** (America/Caracas, UTC−4, sin horario de verano). Las
  respuestas llevan el desfase `-04:00`.
- **Tiempos de viaje, no itinerarios por parada.** Cada parada guarda los minutos desde el origen,
  así un horario (por ejemplo, 21:30) da la hora en cada parada. Un viaje puede durar hasta 72
  horas.

## Reglas

- `routes.manage` (dueño, administrador) edita rutas, tarifas y horarios. Cualquier miembro puede
  verlos. Otras organizaciones reciben 404.
- Una ruta necesita: el origen a 0 minutos, tiempos estrictamente crecientes, cada parada una sola
  vez y todas las paradas activas. Reemplazar las paradas elimina las tarifas cuyas paradas
  salieron de la ruta o cambiaron de orden.
- **Publicar** (`draft`/`inactive` → `active`) exige una organización aprobada, al menos un
  horario activo y la tarifa del origen al destino final. Las rutas publicadas se desactivan, no se
  borran; solo se pueden borrar los borradores.
- Las tarifas son decimales positivos con hasta dos decimales. La lista se reemplaza completa.
- Horarios: `HH:MM`, al menos un día, de 1 a 100 puestos, `validUntil` igual o posterior a
  `validFrom`; hasta 100 por ruta. Pausar un horario (`active: false`) lo oculta de la búsqueda.

## Búsqueda de salidas

`GET /api/v1/search/departures?from=<stopId>&to=<stopId>&date=YYYY-MM-DD` es **pública**.
Devuelve las salidas de horarios activos, en rutas activas de organizaciones activas, en las que
`from` va antes que `to`, ordenadas por hora, con la tarifa de ese par (o `null`) y los puestos
libres (`seatsAvailable`).

La fecha es la fecha local en la parada de abordaje. Un bus que sale de Caracas a las 21:30 llega a
Valencia a las 23:30 del mismo día, pero a Maracaibo después de medianoche, así que la búsqueda
mira hasta tres días de servicio hacia atrás (`departures.ts`, con pruebas unitarias): el resultado
lleva tanto la `serviceDate` (el día en que salió del origen) como `departsAt` / `arrivesAt` en
hora local. Se puede buscar desde hoy hasta 180 días adelante.

Las salidas no se guardan: el registro de un **viaje** (para apartar puestos) se crea con la
primera reserva, a partir del mismo cálculo ([bookings.md](bookings.md)).

## Dónde buscan los pasajeros

- **Web** `/` y `/buscar?from=&to=&date=`: un formulario GET simple, así los resultados funcionan
  sin JavaScript y se pueden compartir como enlaces. La lista de paradas se guarda en caché unos
  minutos; las salidas nunca. El formulario lee las paradas solo al atender la solicitud, así que
  la compilación nunca llama a la API.
- **App de pasajeros** (`apps/passenger-mobile`): búsqueda, selector de paradas y resultados, sin
  necesidad de cuenta.
- Las funciones de presentación que usan ambas (`localTime`, `daysBetween`, `longDate`,
  `formatMoney`, `todayInVenezuela`) están en `@vtp/shared-types`.

## Endpoints (`/api/v1`)

| Método y ruta                                                        | Quién                                    |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `GET /stops?q=&kind=`                                                | Público — paradas activas                |
| `GET/POST /admin/stops`, `PATCH /admin/stops/:stopId`                | Revisor o administrador de la plataforma |
| `GET /organizations/:id/routes`, `GET …/routes/:routeId`             | Miembros                                 |
| `POST /organizations/:id/routes`, `PATCH`/`DELETE …/routes/:routeId` | `routes.manage`                          |
| `POST …/routes/:routeId/status` (`active` / `inactive`)              | `routes.manage`                          |
| `PUT …/routes/:routeId/fares`                                        | `routes.manage`                          |
| `POST …/routes/:routeId/schedules`, `PATCH`/`DELETE …/schedules/:id` | `routes.manage`                          |
| `GET /search/departures?from=&to=&date=`                             | Público                                  |

Eventos de auditoría: `stop.created`, `stop.updated`, `route.created`, `route.updated`,
`route.deleted`, `route.status_changed`, `route.fares_replaced`, `route.schedule_created`,
`.schedule_updated`, `.schedule_deleted`.

## Todavía no

- Andenes dentro de los terminales, y vehículos.
- Excepciones a los horarios (feriados, salidas canceladas sueltas) y estado en tiempo real.
- Mostrar las tarifas en otras monedas: la búsqueda muestra cada tarifa en la moneda que fijó la
  empresa; la conversión solo ocurre cuando el pasajero paga ([payments](payments.md)).

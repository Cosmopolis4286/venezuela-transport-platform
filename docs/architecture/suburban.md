# Transporte suburbano y paquetes de viajes

**Estado: implementado** ([ADR-035](decisions.md#adr-035-mototaxis-paquetes-de-viajes-y-taxis-y-motos-por-tramo-en-las-zonas)
y [ADR-036](decisions.md#adr-036-tasa-por-cancelar-tarde-un-taxi-o-una-moto-que-una-línea-ya-tomó)),
sobre las zonas operativas y el servicio por frecuencia de `main`. El detalle de cada parte está
en los documentos de cada módulo ([network](network.md), [fleet](fleet.md),
[bookings](bookings.md), [taxis](taxis.md), [settlements](settlements.md)); aquí queda el resumen.

## Objetivo

Además de los autobuses entre ciudades, la plataforma atiende el **transporte suburbano**: viajes
cortos y frecuentes entre ciudades cercanas, en **bus, carro (taxi por puesto) o moto**. La
primera versión cubre la zona **Casacoima – San Félix – Puerto Ordaz**; otras zonas y
ciudades se agregan después como datos (paradas, rutas y paquetes), sin cambiar el código.

Los pasajeros **reservan su puesto con anticipación** y pueden pagarlo con **paquetes de viajes**
que compran por adelantado. Cada tipo de vehículo tiene precios distintos.

## Decisiones del dueño del producto (2026-11-08)

| Pregunta                                     | Decisión                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ¿Quién vende los paquetes?                   | **La plataforma.** Sirven con cualquier empresa adherida que haga ese tramo en ese vehículo   |
| ¿Qué cubre un paquete?                       | **Un tramo fijo** (par de paradas) en un tipo de vehículo                                     |
| ¿Vencen?                                     | **Sí**, a los días que fije cada paquete; **60 por defecto**                                  |
| Taxis y motos: ¿con horario o bajo demanda?  | **Híbrido:** salidas con horario y también viajes bajo demanda                                |
| Cancelar una reserva                         | Hasta **30 minutos antes** de la hora de viaje; después, no hay devolución                    |
| Devoluciones                                 | **Escalonadas** según el tiempo que falta y el momento en que se cancela (ver abajo)          |
| Motos                                        | **Un tipo de organización nuevo**: línea de mototaxis (`moto_line`)                           |
| ¿Cómo se sabe si una ruta es suburbana?      | **La empresa lo elige** al crear la ruta (Interurbano o Suburbano)                            |
| Apagar un servicio                           | Interruptores **por zona o ciudad**, no solo uno general                                      |
| ¿Y lo ya vendido si se apaga?                | **Se respeta:** solo deja de venderse; boletos y paquetes siguen válidos                      |
| Pasajeros por moto                           | **Uno**                                                                                       |
| Sentido de un paquete                        | **Ida y vuelta** (A → B y B → A)                                                              |
| Límites por paquete                          | **4 reservas futuras** sin usar, **una por salida**                                           |
| Devolver un paquete                          | **No se devuelve**; los viajes sin usar se pierden al vencer                                  |
| Cuánto gana la empresa por viaje con paquete | **Su tarifa normal del tramo** menos comisión (hasta el tope por viaje del paquete, si tiene) |
| Tramos de reembolso suburbanos               | 100 % desde 24 h, 75 % desde 2 h, 50 % desde 30 min, nada después; interurbano sin cambios    |

Las supuestas en este documento, que conviene confirmar, están marcadas con **(por confirmar)**.

## 0. Dónde se vende: zonas operativas y rutas suburbanas

Esta parte la resolvió `main` en paralelo y el suburbano se apoya en ella:

- **Zonas operativas** ([ADR-028](decisions.md#adr-028-varias-ciudades-con-zonas-operativas-en-una-sola-base-de-datos)):
  cada ciudad o región se activa, se marca como próxima o se pausa en `/admin/zones`. Pausar
  detiene la venta nueva (`ZONE_NOT_ACTIVE`) y respeta lo vendido. Los **paquetes** se venden por
  zona y los **viajes por tramo** van entre dos paradas de una misma zona activa.
- **Alcance de la ruta** (ADR-030): interurbana o urbana/suburbana; la empresa lo elige al crear la
  ruta. Los paquetes solo pagan rutas suburbanas y estas usan la escala de reembolso suburbana.
- **Servicio por frecuencia con boleto abierto** (ADR-032): reemplaza a las "series de horarios"
  del primer diseño.
- La app de pasajeros muestra las tarjetas de **paquetes** y de **taxi o moto por tramo** solo si
  hay al menos una zona activa; si no, la pantalla queda igual que antes.

## 1. Tipo de vehículo (`TransportMode`)

`TRANSPORT_MODES = ['bus', 'car', 'motorcycle']` en `shared-types/src/api/network.ts`, con su enum
en la base de datos y textos en los cuatro diccionarios.

- **`routes.mode`**: cada ruta es de un solo tipo de vehículo. Así cada tipo tiene su propia
  tarifa por tramo sin cambiar `route_fares`. Las rutas existentes quedan como `bus` (o `car` las
  de las líneas de taxis) en la migración.
- **`vehicles.mode`**: el despacho solo asigna vehículos del mismo tipo que la ruta. Una moto
  lleva **un pasajero**; un carro por puesto, hasta 4 (plantilla existente).
- Qué tipos puede usar cada organización: `bus_company` → bus; `taxi_line` → carro;
  `moto_line` → moto.
- La búsqueda acepta `mode` (`GET /search/departures?from=&to=&date=&mode=`) y cada salida trae su
  tipo; la web y la app muestran pestañas **Bus · Taxi · Moto**.

## 2. Líneas de mototaxis (`moto_line`)

Organización nueva en `ORGANIZATION_TYPES`, con los mismos roles que una línea de taxis (dueño,
administrador, despachador, conductor) en `ROLES_BY_ORGANIZATION_TYPE`. Pasa por la misma
revisión de la plataforma y el mismo KYC; sus conductores presentan la misma licencia de
conducir, y el revisor verifica que su grado permita conducir motos (no hizo falta un tipo de
documento nuevo). Sus motos llevan los mismos documentos de vehículo (certificado de
circulación, RCV, permiso). Solo publica **rutas suburbanas** de moto: cada salida es una moto
con un pasajero, sin mapa de puestos. También piden viajes bajo demanda por tramo (sección 4).

## 3. Horarios por frecuencia

Ver el servicio por frecuencia con boleto abierto de `main`
([ADR-032](decisions.md#adr-032-servicio-urbano-y-suburbano-por-frecuencia-con-boleto-abierto)).
Un boleto abierto también se puede pagar con un paquete.

## 4. Híbrido: con horario y bajo demanda

| Modalidad        | Vehículos        | Cómo funciona                                                                                                                   | Paquetes |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Con horario**  | Bus, carro, moto | Ruta con salidas fijas o por frecuencia; el pasajero reserva puesto (bus) o cupo (carro, moto); boleto QR. Reutiliza `bookings` | Sí       |
| **Bajo demanda** | Carro, moto      | El pasajero pide un viaje del tramo **para ahora o para una hora** (reserva); la primera línea que lo toma se queda con él      | Sí       |

**Bajo demanda** amplía el módulo `taxi`:

- Hoy un taxi solo sale de un terminal o llega a él. Pasa a pedirse también **por tramo**
  (`taxi_rides.kind = 'stretch'`): parada de origen y de destino de la zona, el tipo (taxi o
  moto) y la **dirección de recogida cerca de la parada de origen**, escrita por el pasajero. Sin
  mapa ni GPS en esta versión: la línea decide si llega (decidido por el dueño del producto).
- **Tarifa fija por tramo** que publica cada línea (`on_demand_fares`, en los dos sentidos, por
  tipo de vehículo). El pasajero ve antes de pedir el rango de tarifas de las líneas que hacen el
  tramo; la línea que toma el viaje cobra la suya. Una línea ve las solicitudes de los tramos que
  tiene con tarifa.
- **Ahora o para una hora** (`scheduledFor`): la solicitud se ofrece a las líneas **desde que se
  pide** (decidido) y vence si nadie la toma hasta 20 minutos después de la hora pedida.
- Se paga directo al conductor o con un paquete del tramo y vehículo (ver
  [taxis.md](taxis.md#viajes-por-tramo-bajo-demanda-adr-028)).
- Las líneas de mototaxis usan el mismo flujo, con un pasajero por moto (decidido).

## 5. Paquetes de viajes (módulo nuevo `trip-packs`)

### Catálogo (lo administra la plataforma, rol `admin`)

`trip_pack_products`: tipo de vehículo, **tramo** (parada A y parada B), cantidad de viajes (por
ejemplo 5, 10, 20), precio y moneda (US$ o Bs.), días de vigencia (por defecto
`DEFAULT_TRIP_PACK_VALIDITY_DAYS = 60`), activo o no. Un paquete del tramo A–B sirve **en los dos
sentidos** (A → B y B → A), para ir y volver (decidido). El precio por viaje es
`precio ÷ viajes` y queda congelado en cada compra.

### Empresas adheridas

Como vende la plataforma, el paquete sirve con **cualquier empresa adherida**: una política nueva
`organization_policies.accepts_trip_packs` (la activa un administrador, después de acordarlo con la
empresa). Las salidas de esas empresas, del mismo tipo de vehículo, en las que A y B están en la
ruta, aceptan el paquete.

### Compra (`trip_packs`)

El pasajero compra en la app o la web con los métodos y tasas de cambio de siempre; **siempre
cobra la plataforma** (`collectorOrganizationId = null`, ADR-027). Hasta que se confirma el pago,
el paquete está `pending_payment`; al confirmarse, `active` con `expiresAt` = confirmación + días
de vigencia. Estados: `pending_payment` → `active` → `exhausted` (sin viajes) / `expired` /
`refunded`.

`payments.booking_id` deja de ser obligatorio y se agrega `trip_pack_id`, con un `check` que exige
exactamente uno de los dos. `PaymentsService.receive` activa el paquete en vez de confirmar una
reserva.

### Usar el paquete al reservar

- `POST /bookings` con `tripPackId` (y `POST /me/taxi-rides` con `tripPackId` bajo demanda).
- Se descuenta **un viaje por puesto** en una sola sentencia atómica
  (`… SET remaining = remaining - n WHERE remaining >= n AND status = 'active' AND expires_at > now()`),
  en la misma transacción que aparta los puestos: dos reservas simultáneas nunca gastan el mismo
  viaje.
- La reserva queda `confirmed` al instante, con sus boletos; no pasa por el apartado de 15
  minutos.
- Debe coincidir con el paquete: mismo tipo de vehículo, tramo A–B o B–A exacto, empresa adherida,
  y la salida antes de que venza el paquete.
- Límites contra el acaparamiento (decididos): hasta 6 puestos por reserva, hasta 4 reservas
  futuras sin usar por paquete, una reserva por salida.
- El paquete es de quien lo compró, pero puede reservar para otras personas (con sus nombres, como
  hoy).

Motivos nuevos en `API_ERROR_REASONS`: `TRIP_PACK_EXHAUSTED`, `TRIP_PACK_EXPIRED`,
`TRIP_PACK_NOT_VALID_HERE`, `TRIP_PACK_TOO_MANY_BOOKINGS`, `CANCELLATION_TOO_LATE`.

### Cancelaciones y devoluciones escalonadas

**Regla general:** se puede cancelar con devolución hasta **30 minutos antes** de la hora de
abordaje. Después de eso, o si el pasajero no se presenta, no hay devolución.

Antes de esos 30 minutos la devolución es **escalonada** y depende de cómo se pagó:

1. **Reserva pagada directamente** (sin paquete): usa los tramos de reembolso existentes
   (ADR-025), que ahora admiten **cuartos de hora** (0,5 h = 30 minutos) y se muestran como
   "30 min". Las rutas suburbanas tienen **su propia política**, la misma para todas las empresas
   (`platform_settings.suburban_refund_tiers`, editable en Administración → Liquidaciones); las
   rutas entre ciudades siguen con la de siempre y las políticas propias de cada empresa.
   Tramos suburbanos (decididos):

   | Cancela con al menos… | Se devuelve |
   | --------------------- | ----------- |
   | 24 horas              | 100 %       |
   | 2 horas               | 75 %        |
   | 30 minutos            | 50 %        |
   | menos de 30 minutos   | 0 %         |

   La plataforma conserva su comisión, como hoy.

2. **Reserva hecha con un paquete:** un viaje no se puede devolver a medias, así que el
   escalonado se aplica con **dos tramos**: con 30 minutos o más, **el viaje vuelve al paquete**
   (si el paquete ya venció, se pierde); con menos, se pierde. La empresa pierde lo que había
   ganado por ese viaje.

3. **Devolver un paquete:** **no se devuelve** (decidido por el dueño del producto). Los viajes
   se pueden usar hasta que vence; los que quedan sin usar se pierden. Solo se devuelve el dinero
   de un pago que llegó cuando el paquete ya no podía activarse (como con las reservas).

4. **Taxi o moto por tramo** (ADR-036): el viaje del paquete vuelve siempre que el pasajero
   cancela. Si una línea ya lo había tomado hace más de 3 minutos (o faltan menos de 30 para uno
   programado), el pasajero debe una tasa del 50 % de la tarifa de la línea, que paga en efectivo
   en su próximo viaje. Ver [taxis.md](taxis.md#cancelar-un-viaje-que-una-línea-ya-tomó-adr-030).

Al cancelar se muestra antes cuánto se devuelve, como hoy (`GET /me/bookings/:id/cancellation`,
y uno nuevo para paquetes).

### Dinero: liquidaciones

- El dinero del paquete llega a la plataforma al comprarlo, pero **la empresa lo gana cuando se usa
  cada viaje**: al reservar con el paquete se anota en el libro una entrada `booking` con bruto =
  **la tarifa normal de la empresa para ese tramo** × puestos (decidido por el dueño del
  producto), sin cargo por servicio y sin comisión (ADR-029), hasta el **tope por viaje** del
  paquete si lo tiene. Cobra la empresa o el conductor, según la ruta (ADR-030). Si la reserva se cancela a tiempo, la entrada
  `cancellation` lo revierte.
- La diferencia entre el precio por viaje del paquete y la tarifa de la empresa la **pone o la gana
  la plataforma** (si el paquete tiene descuento, la plataforma lo subsidia). Los viajes que vencen
  sin usarse se los queda la plataforma.
- **Moneda y tasas:** el paquete tiene precio en US$ o Bs. Como lo vende la plataforma, se paga con
  las **tasas de cambio de la plataforma**, que fija el administrador (las de cada empresa siguen
  sirviendo para sus boletos).
- Reportes de la administración: paquetes vendidos, viajes usados, **viajes vendidos sin usar**
  (lo que la plataforma debe en servicio) y vencidos. Las empresas ven en sus reportes cuántas
  reservas llegaron por paquete.

## 6. Pantallas

- **App de pasajeros y web pública:** pestañas Bus · Taxi · Moto en la búsqueda; **Paquetes**
  (comprar, ver los que tiene con viajes restantes y vencimiento); al reservar, "Usar paquete
  (quedan 7)"; pedir taxi o moto bajo demanda por tramo, ahora o para una hora; devolver un
  paquete. Textos en los cuatro diccionarios (es, en, pt-BR).
- **Portal de las empresas:** tipo de vehículo en rutas y vehículos, horarios por frecuencia,
  tarifas fijas por tramo de las líneas de taxis y mototaxis, zonas de servicio, reservas por
  paquete en los reportes.
- **Administración:** catálogo de paquetes, empresas adheridas, tramos de devolución de paquetes,
  reportes de paquetes.
- **App de transportistas:** sin cambios grandes; bajo demanda muestra las solicitudes
  programadas, y el escáner valida los boletos de paquete como cualquier otro.

## 7. Legal, datos personales y avisos

- ✅ Condiciones de los paquetes (vigencia, uso por tramo, sin reembolso, cancelación hasta 30
  minutos antes), tramos suburbanos y tasa de cancelación de taxis y motos en los términos, la
  política de reembolsos y las condiciones para empresas de `docs/legal` (versión 2026-11-12).
- Comprar paquetes es cobrar por servicios que prestan terceros: entra en la revisión legal
  pendiente del ADR-018.
- `account-deletion.service.ts`: al borrar la cuenta se anonimiza el dueño de los paquetes (y se
  decide qué pasa con los viajes sin usar: se pierden, salvo que pida antes la devolución).
- Avisos: paquete activado, por vencer (7 días antes), último viaje usado, reserva hecha con el
  paquete.

## 8. Datos de la primera zona

Paradas y rutas de Casacoima, San Félix y Puerto Ordaz cargadas como datos por el personal de la
plataforma (catálogo de paradas) y por las empresas (rutas, tarifas, horarios), más los productos
de paquetes por tramo y tipo de vehículo. Nada de esto queda en el código.

## Plan por pull requests

El trabajo se hizo primero sobre corredores propios y series de horarios; al integrarlo con `main`
(que en paralelo agregó zonas, frecuencia, cargo al pasajero y cobro por conductor) se rehízo
encima de esos conceptos:

1. ✅ **Tipo de vehículo** en rutas, vehículos, despacho y búsqueda; pestañas en la web y la app.
2. ✅ **Líneas de mototaxis**: `moto_line`, solo rutas suburbanas, un pasajero por moto.
3. ✅ **Tramos de reembolso suburbanos** para las rutas suburbanas de todas las empresas.
4. ✅ **Paquetes de viajes** por zona: catálogo, compra y pago con tasas de la plataforma (frescas,
   24 h), reservas con paquete (también boletos abiertos), tope por viaje, aviso de vencimiento,
   reportes.
5. ✅ **Taxi o moto por tramo**: tarifas fijas por tramo de una zona, ahora o programado, pago con
   paquete y código de recogida.
6. ✅ **Tasa de cancelación** (ADR-036), viajes abandonados y «terminar sin cobrar la tasa».
7. ✅ **Legal**: condiciones de los paquetes, escala suburbana, taxis y motos por tramo y su tasa.
   Sigue pendiente la revisión de un abogado, como el resto de `docs/legal`.

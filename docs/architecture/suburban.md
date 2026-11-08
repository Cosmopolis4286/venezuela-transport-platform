# Transporte suburbano y paquetes de viajes

**Estado: diseño aprobado (ADR-028), sin implementar.** Este documento describe lo que se va a
construir; el plan por pull requests está al final y en la [hoja de ruta](../roadmap.md). Cuando
cada parte exista, su detalle pasa a los documentos de cada módulo ([network](network.md),
[fleet](fleet.md), [bookings](bookings.md), [taxis](taxis.md), [settlements](settlements.md)) y
aquí queda el resumen.

## Objetivo

Además de los autobuses entre ciudades, la plataforma atiende el **transporte suburbano**: viajes
cortos y frecuentes entre ciudades cercanas, en **bus, carro (taxi por puesto) o moto**. La
primera versión cubre el corredor **Casacoima – San Félix – Puerto Ordaz**; otros corredores y
ciudades se agregan después como datos (paradas, rutas y paquetes), sin cambiar el código.

Los pasajeros **reservan su puesto con anticipación** y pueden pagarlo con **paquetes de viajes**
que compran por adelantado. Cada tipo de vehículo tiene precios distintos.

## Decisiones del dueño del producto (2026-11-08)

| Pregunta                                    | Decisión                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ¿Quién vende los paquetes?                  | **La plataforma.** Sirven con cualquier empresa adherida que haga ese tramo en ese vehículo |
| ¿Qué cubre un paquete?                      | **Un tramo fijo** (par de paradas) en un tipo de vehículo                                   |
| ¿Vencen?                                    | **Sí**, a los días que fije cada paquete; **60 por defecto**                                |
| Taxis y motos: ¿con horario o bajo demanda? | **Híbrido:** salidas con horario y también viajes bajo demanda                              |
| Cancelar una reserva                        | Hasta **30 minutos antes** de la hora de viaje; después, no hay devolución                  |
| Devoluciones                                | **Escalonadas** según el tiempo que falta y el momento en que se cancela (ver abajo)        |
| Motos                                       | **Un tipo de organización nuevo**: línea de mototaxis (`moto_line`)                         |

Las supuestas en este documento, que conviene confirmar, están marcadas con **(por confirmar)**.

## 1. Tipo de vehículo (`TransportMode`)

`TRANSPORT_MODES = ['bus', 'car', 'motorcycle']` en `shared-types/src/api/network.ts`, con su enum
en la base de datos y textos en los cuatro diccionarios.

- **`routes.mode`**: cada ruta es de un solo tipo de vehículo. Así cada tipo tiene su propia
  tarifa por tramo sin cambiar `route_fares`. Las rutas existentes quedan como `bus` (o `car` las
  de las líneas de taxis) en la migración.
- **`vehicles.mode`**: el despacho solo asigna vehículos del mismo tipo que la ruta. Una moto
  lleva **un pasajero** (por confirmar); un carro por puesto, hasta 4 (plantilla existente).
- Qué tipos puede usar cada organización: `bus_company` → bus; `taxi_line` → carro;
  `moto_line` → moto.
- La búsqueda acepta `mode` (`GET /search/departures?from=&to=&date=&mode=`) y cada salida trae su
  tipo; la web y la app muestran pestañas **Bus · Taxi · Moto**.

## 2. Líneas de mototaxis (`moto_line`)

Organización nueva en `ORGANIZATION_TYPES`, con los mismos roles que una línea de taxis (dueño,
administrador, despachador, conductor) en `ROLES_BY_ORGANIZATION_TYPE`. Pasa por la misma
revisión de la plataforma y el mismo KYC; sus conductores necesitan licencia para moto (tipo de
documento nuevo en `onboarding`) y sus motos, los mismos documentos de vehículo (certificado de
circulación, RCV, permiso). Opera igual que una línea de taxis: rutas con horario y viajes bajo
demanda.

## 3. Horarios por frecuencia

El servicio suburbano sale cada pocos minutos, no a unas cuantas horas fijas. Un horario puede ser:

- **fijo** (como hoy): `departureTime`;
- **por frecuencia** (nuevo): `startTime`, `endTime` y `headwayMinutes` (por ejemplo, de 05:00 a
  20:00 cada 15 minutos), con los mismos días, vigencia y capacidad.

Las salidas se siguen calculando sin guardarse (`departures.ts`): un horario por frecuencia
genera una salida por intervalo. El viaje se crea con la primera reserva, como hoy.

## 4. Híbrido: con horario y bajo demanda

| Modalidad        | Vehículos        | Cómo funciona                                                                                                                   | Paquetes |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Con horario**  | Bus, carro, moto | Ruta con salidas fijas o por frecuencia; el pasajero reserva puesto (bus) o cupo (carro, moto); boleto QR. Reutiliza `bookings` | Sí       |
| **Bajo demanda** | Carro, moto      | El pasajero pide un viaje del tramo **para ahora o para una hora** (reserva); la primera línea que lo toma se queda con él      | Sí       |

**Bajo demanda** amplía el módulo `taxi`:

- Hoy un taxi solo sale de un terminal o llega a él. Pasa a pedirse **por tramo**: parada de
  origen y de destino del catálogo, más la dirección exacta de recogida y de llegada dentro de la
  **zona de servicio** de cada parada (radio en km que fija la línea, por confirmar).
- **Tarifa fija por tramo** que publica cada línea (resuelve la decisión pendiente de las tarifas
  de taxi): el pasajero la ve antes de pedir. Ya no se escribe al tomar el viaje.
- **Para una hora** (`scheduledFor`): la solicitud se ofrece a las líneas desde
  `TAXI_SCHEDULED_LEAD_MINUTES` antes (por confirmar: 30) y se puede tomar desde que se pide.
- Se paga con un paquete del tramo y tipo, o directo al conductor como hoy.
- Las líneas de mototaxis usan el mismo flujo, con un pasajero por moto.

## 5. Paquetes de viajes (módulo nuevo `trip-packs`)

### Catálogo (lo administra la plataforma, rol `admin`)

`trip_pack_products`: tipo de vehículo, **tramo** (parada A y parada B), cantidad de viajes (por
ejemplo 5, 10, 20), precio y moneda (US$ o Bs.), días de vigencia (por defecto
`DEFAULT_TRIP_PACK_VALIDITY_DAYS = 60`), activo o no. Un paquete del tramo A–B sirve **en los dos
sentidos** (A → B y B → A), para ir y volver (por confirmar). El precio por viaje es
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
- Límites contra el acaparamiento (por confirmar): hasta 6 puestos por reserva, hasta 4 reservas
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
   (ADR-025), que pasan a medirse **en minutos** (hoy son horas enteras) para poder expresar los 30
   minutos. Tramos por defecto para rutas suburbanas (por confirmar):

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

3. **Devolver un paquete** (el dinero de los viajes sin usar): el pasajero lo pide en la app; se
   devuelve `viajes sin usar × precio por viaje × porcentaje`, escalonado según el momento en que
   lo pide y la vigencia que le queda (por confirmar):

   | Cuándo lo pide                             | Se devuelve |
   | ------------------------------------------ | ----------- |
   | En los primeros 7 días y sin haberlo usado | 100 %       |
   | Le quedan 30 días o más de vigencia        | 75 %        |
   | Le quedan entre 10 y 29 días               | 50 %        |
   | Le quedan menos de 10 días, o ya venció    | 0 %         |

   Las reservas futuras hechas con ese paquete se cancelan antes de calcular (con la regla del
   punto 2). El reembolso entra en la cola de **Reembolsos** existente. Los tramos son editables
   por un administrador, como la política de reembolsos.

Al cancelar se muestra antes cuánto se devuelve, como hoy (`GET /me/bookings/:id/cancellation`,
y uno nuevo para paquetes).

### Dinero: liquidaciones

- El dinero del paquete llega a la plataforma al comprarlo, pero **la empresa lo gana cuando se usa
  cada viaje**: al reservar con el paquete se anota en el libro una entrada `booking` con bruto =
  precio por viaje × puestos, menos la comisión de esa empresa (ADR-024). Si la reserva se cancela
  a tiempo, la entrada `cancellation` lo revierte.
- Los viajes que vencen sin usarse, y la parte no devuelta de un paquete, **se los queda la
  plataforma** (ella vendió el paquete).
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

- Condiciones de los paquetes (vigencia, uso por tramo, devoluciones escalonadas, cancelación
  hasta 30 minutos antes) en los términos y la política de reembolsos de `docs/legal`. Es un
  cambio importante: sube `version` y `LEGAL_VERSION`.
- Comprar paquetes es cobrar por servicios que prestan terceros: entra en la revisión legal
  pendiente del ADR-018.
- `account-deletion.service.ts`: al borrar la cuenta se anonimiza el dueño de los paquetes (y se
  decide qué pasa con los viajes sin usar: se pierden, salvo que pida antes la devolución).
- Avisos: paquete activado, por vencer (7 días antes), último viaje usado, reserva hecha con el
  paquete.

## 8. Datos del primer corredor

Paradas y rutas de Casacoima, San Félix y Puerto Ordaz cargadas como datos por el personal de la
plataforma (catálogo de paradas) y por las empresas (rutas, tarifas, horarios), más los productos
de paquetes por tramo y tipo de vehículo. Nada de esto queda en el código.

## Plan por pull requests

1. **Tipo de vehículo**: `TransportMode` en rutas, vehículos, despacho y búsqueda; pestañas en la
   web y la app.
2. **Líneas de mototaxis**: `moto_line`, roles, KYC (licencia de moto).
3. **Horarios por frecuencia.**
4. **Tramos de reembolso en minutos** y regla de los 30 minutos.
5. **Paquetes: catálogo y compra** (`trip_pack_products`, `trip_packs`, `payments` con
   `trip_pack_id`, empresas adheridas), con las pantallas de compra.
6. **Paquetes: usarlos al reservar**, cancelaciones, libro de liquidaciones, avisos.
7. **Devolver un paquete** (tramos escalonados) y reportes de paquetes.
8. **Bajo demanda por tramo**: taxis y motos con tarifa fija, para ahora o para una hora, pagados
   con paquete.
9. **Legal**: condiciones de los paquetes y nueva versión de los documentos.

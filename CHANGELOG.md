# Registro de cambios

Cambios importantes de la Venezuela Transport Platform, del más reciente al más antiguo. El
formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); el proyecto todavía no
tiene versiones publicadas, así que los cambios se agrupan por la fecha en que llegaron a `main`,
con el pull request que los trajo. Lo que está hecho y lo que falta se sigue en
[docs/roadmap.md](docs/roadmap.md).

Cuando un pull request cambia el comportamiento, agrega una línea en **Sin publicar** en el mismo
pull request.

## Sin publicar

### Agregado

- **Inglés y portugués de Brasil para el pasajero.** La web pública (`/es`, `/en`, `/pt-br`) y toda
  la app de pasajeros, incluidos el inicio de sesión, los estados, los métodos de pago y los
  mensajes de error, ahora también están en inglés y en portugués de Brasil. El idioma se toma del
  navegador o del teléfono y se puede cambiar con un selector; la elección se recuerda. `/` y
  `/buscar` redirigen al idioma del visitante. El portal y la app de transportistas siguen en
  español. Ver [docs/architecture/i18n.md](docs/architecture/i18n.md).
- **Taxis desde y hacia los terminales.** Los pasajeros piden un taxi en la app (terminal,
  sentido, dirección); las líneas de taxi que operan en ese terminal ven la solicitud, y la
  primera que la toma (un conductor desde su app o un despachador desde el portal) fija el
  vehículo y la tarifa. El pasajero ve la placa, el conductor y la tarifa; el conductor marca
  pasajero a bordo y viaje terminado. La base de datos garantiza un taxi abierto por pasajero y
  un viaje activo por conductor y por vehículo. Por ahora el pago es directo al conductor. Ver
  [docs/architecture/taxis.md](docs/architecture/taxis.md).
- **Vehículos y despacho.** Las empresas registran sus vehículos (placa, nombre interno, mapa de
  puestos) y asignan un vehículo y un conductor a cada salida desde el tablero de despacho del
  portal, que muestra todas las salidas del día, tengan reservas o no. La API impide que un
  vehículo o un conductor esté en dos viajes a la vez y que un vehículo vaya en una salida vendida
  con otro mapa de puestos. Los conductores ven sus viajes y quién viaja en la app de
  transportistas (sin los documentos de los pasajeros). Ver
  [docs/architecture/dispatch.md](docs/architecture/dispatch.md).
- **CI en un runner propio** (ADR-022): un workflow de GitHub Actions que corre los trabajos de
  CircleCI en un runner instalado en la computadora del mantenedor (Windows + WSL 2), sin costo.
  Instalación en [docs/development/self-hosted-runner.md](docs/development/self-hosted-runner.md).
- `CHANGELOG.md` y la [hoja de ruta](docs/roadmap.md).
- **Correr la plataforma en Docker** ([docker.md](docs/development/docker.md)): `pnpm stack:api`
  (híbrido: base de datos y API en Docker, frontends en tu computadora) y `pnpm stack:app` (base
  de datos, API y web con las imágenes de producción y ajustes de desarrollo). Las migraciones se
  aplican solas.
- [Guía para probar en Android](docs/development/android-testing.md): Expo Go, emulador y APK.
- Toda la documentación, en español.

### Cambiado

- **El repositorio es público y la CI corre en GitHub Actions** (`.github/workflows/ci.yml`), en
  las máquinas de GitHub y sin costo (ADR-023). El runner propio queda solo para lanzarlo a mano.
- La web pública cambió de dirección: `/es` y `/es/buscar` (las anteriores, `/` y `/buscar`,
  redirigen). Los textos que decían que la compra de boletos "llegará pronto" ya no lo dicen.
- Los viajes y la lista de pasajeros del portal muestran el vehículo y el conductor asignados.
- Los teléfonos se muestran en formato venezolano (`0414-1234567`) en el portal y las apps.
- Las respuestas de error de la API pueden traer un **`reason`** estable (por ejemplo
  `SEAT_TAKEN`, `DRIVER_BUSY`, `TAXI_RIDE_TAKEN`) además del `code`; es un campo nuevo y opcional,
  así que los clientes existentes siguen funcionando. Reservas, pagos, vehículos, despacho y taxis
  ya lo envían, y el portal y las apps lo muestran en español: varios rechazos que las apps
  móviles mostraban en inglés ahora salen en español.
- La hora de Venezuela se calcula en un solo lugar (`toNetworkIso`, `networkClock` en
  `@vtp/shared-types`); los roles que conducen (`rolesWith`) y la normalización de placas se
  comparten. Las placas de las solicitudes KYC ahora también aceptan puntos (`AB.123.CD`).
- La [hoja de ruta](docs/roadmap.md) lista todas las decisiones pendientes con una recomendación,
  los valores por defecto para confirmar y los riesgos y la deuda técnica conocidos.

### Corregido

- La imagen de la API ya no falla al arrancar con `NODE_ENV=development`: el formateador bonito de
  logs solo se usa si está instalado.

## 2026-10-27

### Agregado

- **Escáner de boletos en la app de transportistas** (#29). Inspectores, administradores y dueños
  escanean el QR del pasajero con la cámara, o escriben el código de reserva y el puesto, y ven al
  instante si puede abordar. El primer escaneo válido marca el abordaje; un QR reutilizado muestra
  cuándo se usó. La validación de boletos ahora informa `not_paid` y `other_departure` con los
  datos del pasajero, en lugar de un error.
- **Pagos y boletos QR** (#23, paso 3 del ADR-018). Las empresas fijan sus tasas de cambio
  (bolívares y reales por dólar). Los pasajeros pagan una reserva apartada por pago móvil,
  transferencia bancaria, PIX o USDT, con el monto convertido y congelado, y reciben un boleto QR
  por puesto cuando se confirma el pago. Un proveedor simulado mueve el flujo hasta que se
  contraten proveedores reales; la configuración de producción lo rechaza. Los pagos tardíos o con
  monto incorrecto quedan marcados para reembolso.
- **Reservas de puestos** (#20, paso 2 del ADR-018). Los pasajeros eligen puestos en el mapa del
  bus y los apartan por 15 minutos (`BOOKING_HOLD_MINUTES`); ningún puesto se puede vender dos
  veces, ni siquiera con solicitudes simultáneas. "Mis viajes" en la app de pasajeros. Las empresas
  ven los viajes por fecha y la lista de pasajeros para el abordaje. La búsqueda muestra los
  puestos libres.
- Migraciones `0006_bookings` y `0007_payments_and_tickets`.
- Configuración nueva: `BOOKING_HOLD_MINUTES`, `PAYMENT_PROVIDER`.

### Cambiado

- **La CI pasó de GitHub Actions a CircleCI** (#20, ADR-019): calidad, pruebas e2e de la API con
  PostGIS, bundles móviles e imágenes Docker.
- Dependabot ya no propone versiones mayores de `@types/node`: los tipos siguen al runtime de
  Node 24 (#28).
- Actualizaciones de dependencias: grupo Next.js (#16), parches del SDK 58 de Expo (#15),
  herramientas de desarrollo (#26), parches de runtime (#27).

## 2026-10-19

### Agregado

- **Mapas de puestos** (#14): las empresas dibujan la distribución de cada tipo de vehículo
  (plantillas, uno o dos pisos) en el portal; los horarios toman su capacidad del mapa.
- **Búsqueda de viajes** (#13) en la web (`/buscar`) y en la app de pasajeros: origen, destino y
  fecha, con horas, duración, empresa, clase y tarifa. Funciona sin cuenta.
- **Red de transporte** (#12): catálogo de paradas (terminales y paradas, PostGIS) administrado
  por la plataforma; rutas con paradas ordenadas, tarifas por par de paradas y horarios semanales
  publicados por cada empresa de autobuses o línea de taxis; búsqueda pública de salidas.

## 2026-10-18

### Agregado

- **Inicio de sesión móvil** (#11) en las dos apps, compartido mediante `@vtp/mobile-core`, con
  los tokens en el llavero del dispositivo; solicitud KYC con carga de documentos en la app de
  transportistas.
- **Portal web y panel de administración** (#10): inicio de sesión, portal de la organización
  (equipo, invitaciones, solicitantes), revisión de organizaciones y solicitudes KYC por la
  plataforma.
- **Solicitudes de conductores y personal con documentos KYC** (#9): solicitudes, carga de
  documentos con verificación del tipo por contenido, revisión de la plataforma, aceptación de la
  organización.
- **Organizaciones** (#7): empresas de autobuses, líneas de taxis y terminales; roles (dueño,
  administrador, despachador, taquillero, conductor, inspector) con una matriz de permisos,
  invitaciones ligadas a contactos verificados, revisión de la plataforma.
- **Identidad** (#6): cuentas con correo + contraseña o códigos de un solo uso (SMS, WhatsApp,
  correo), tokens de renovación rotativos, registro de auditoría.

### Cambiado

- Actualización de acciones de CI y de la imagen de Redis (#8).

## 2026-10-17

### Agregado

- **Base del proyecto** (#1): monorepo con pnpm + Turborepo con la web en Next.js, dos apps Expo,
  la API NestJS (OpenAPI), contratos compartidos, PostgreSQL 18 + PostGIS 3.6 en Docker Compose,
  lint, formato, pruebas, imágenes de producción y documentación.

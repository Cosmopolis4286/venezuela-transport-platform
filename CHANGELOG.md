# Registro de cambios

Cambios importantes de la Venezuela Transport Platform, del más reciente al más antiguo. El
formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); el proyecto todavía no
tiene versiones publicadas, así que los cambios se agrupan por la fecha en que llegaron a `main`,
con el pull request que los trajo. Lo que está hecho y lo que falta se sigue en
[docs/roadmap.md](docs/roadmap.md).

Cuando un pull request cambia el comportamiento, agrega una línea en **Sin publicar** en el mismo
pull request.

## Sin publicar

### Cambiado

- **Pago a la línea o al conductor** (ADR-030): cada ruta es interurbana o urbana/suburbana y
  elige quién cobra (por defecto, la línea en las interurbanas y el conductor en las urbanas y
  suburbanas). Los conductores ven su saldo y registran dónde cobrar en **Mis cobros** (app de
  transportistas); la plataforma les paga desde la liquidación de la empresa.
- **El cargo de la plataforma ahora lo paga el pasajero encima de la tarifa** (ADR-029, 15 %
  por defecto): la empresa recibe su tarifa completa. Se muestra en la búsqueda (web y app) y
  desglosado al elegir puestos, al apartar y en la reserva. Si cancela el pasajero, se reembolsa
  según los tramos sobre la tarifa y el cargo no se devuelve; si cancela la empresa, se devuelve
  todo y la empresa asume el cargo. Términos, política de reembolsos y condiciones para empresas
  actualizados (versión 2026-11-08: los usuarios aceptan de nuevo).

### Agregado

- **Menú local** (`pnpm menu` o `node infrastructure/scripts/menu.mjs`): revisa Node, pnpm y
  Docker, prepara todo, arranca los servidores, carga **datos de ejemplo del suburbano**
  (`pnpm seed:suburban`), da el rol de administrador, verifica y repara; con reintentos y mensajes
  que dicen cómo arreglar cada problema.
- **Reembolsos suburbanos**: las rutas urbanas o suburbanas de todas las empresas devuelven 100 %
  con 24 h o más, 75 % con 2 h, 50 % con 30 min y nada en los últimos 30 minutos (sobre la tarifa;
  el cargo por servicio no se devuelve). El administrador los edita en Liquidaciones; las rutas
  interurbanas no cambian.
- **Tipo de vehículo** (bus, carro o moto) en cada ruta y cada vehículo: cada tipo tiene sus
  propias tarifas; la búsqueda se filtra por tipo en la web y la app de pasajeros, con pestañas
  solo para los tipos presentes; el despacho solo asigna vehículos del tipo de la ruta
  (`VEHICLE_MODE_MISMATCH`).
- **Líneas de mototaxis** (`moto_line`): organización con los roles de una línea de taxis que solo
  publica rutas urbanas o suburbanas de moto (`SERVICE_NOT_ALLOWED`); cada salida lleva un
  pasajero y no usa mapa de puestos (`MOTORCYCLE_ONE_PASSENGER`).
- **Paquetes de viajes** (ADR-035): la plataforma vende viajes de un tramo de una zona, en un tipo
  de vehículo, que vencen (60 días por defecto) y no se devuelven. Pagan reservas de rutas
  suburbanas (también boletos abiertos) de empresas habilitadas, sin cargo por servicio: hasta 4
  reservas futuras por paquete y una por salida; la empresa (o el conductor) gana su tarifa, hasta
  un tope por viaje opcional. Se cobran con tasas de la plataforma de menos de 24 h; máximo 2
  paquetes esperando pago; aviso 3 días antes de vencer. Catálogo en `/admin/trip-packs`, compra
  en la app, reportes y métricas.
- **Taxi o moto por tramo** (ADR-035): entre dos paradas de una zona activa, ahora o para una
  hora, a la tarifa fija que publica cada línea; se paga al conductor o con un paquete (con
  código de recogida). Las líneas de mototaxis tienen su tablero en el portal y en la app de
  conductores.
- **Tasa por cancelar tarde** un taxi o una moto ya tomados (ADR-036): gratis 3 minutos, hasta 30
  minutos antes de uno programado o si el conductor no llega en 20 minutos; si no, el 50 % de la
  tarifa, pagado en efectivo en el siguiente viaje, completo para la línea que salió. El
  conductor puede terminar «sin cobrar la tasa». Los viajes abandonados se cierran solos.
- Textos legales del suburbano (versión 2026-11-13: los usuarios aceptan de nuevo). Siguen siendo
  borradores para revisión de un abogado.
- **Comprar sin registrarse** (ADR-034): en la app de pasajeros, "Continuar sin crear cuenta"
  guarda una cuenta de invitado en el teléfono con sus viajes y boletos. "Crear mi cuenta" la
  convierte en cuenta normal sin perder nada, e iniciar sesión en una cuenta existente le pasa los
  viajes. Teléfono o WhatsApp de contacto opcional al reservar (lo ve el soporte). Términos y
  Privacidad actualizados (versión 2026-11-12: los usuarios aceptan de nuevo).
- **Atención por WhatsApp**: búsqueda de reservas por código para el personal
  (`/admin/bookings`, auditada, con el contacto del cliente y enlace para escribirle), página
  `/es/app` con un enlace fijo de descarga de la app (`ANDROID_APP_URL`) y la
  [guía de atención](docs/guides/whatsapp-soporte.md) con mensaje de bienvenida, ausencia y
  respuestas rápidas listas para copiar.
- **Botón "Escríbenos por WhatsApp"** en la web (pie de página), la app de pasajeros (Mi cuenta y
  cada reserva, con el código ya escrito) y la app de transportistas. El número sale de
  `SUPPORT_WHATSAPP` en la API (`GET /api/v1/support`): se cambia sin publicar las apps y, vacío,
  oculta el botón. Solo abre un chat; no automatiza nada.
- **Ventas en efectivo** (ADR-033): el conductor anota en la app de transportistas cuántos
  pasajeros le pagaron en efectivo por ruta y tramo; el monto sale de la tarifa publicada. Puede
  anular un registro equivocado el mismo día. El reporte de ventas del portal (y su CSV) lo muestra
  aparte: no lleva comisión ni se liquida.
- **Servicio urbano y suburbano por frecuencia** (ADR-032): un horario puede salir cada N
  minutos hasta una última salida. Se vende un **boleto abierto** para el día, sin elegir puesto,
  válido en cualquier unidad de la ruta. Los conductores ahora pueden validar boletos y, si la ruta
  les paga, cobra quien valida. Portal (campos de frecuencia), búsqueda web y app de pasajeros en
  tres idiomas.
- **Factura a otro nombre y número de factura en la app de pasajeros**: en la reserva el pasajero
  puede pedir la factura del cargo por servicio a otro nombre o RIF hasta que se emita, y ve su
  número, número de control y fecha una vez emitida.
- **Facturación de la tarifa por servicio** (ADR-031): cada pago crea un borrador de factura
  (IVA incluido) que el personal emite en el portal del SENIAT y anota en `/admin/fiscal`; montos
  en bolívares con la tasa BCV del día. Notas de crédito y factura a la empresa cuando cancela una
  salida. Libros de ventas y compras por mes con descarga CSV. Tipo de contribuyente (ordinario o
  formal) configurable y `INVOICE_ISSUER` preparado para una imprenta digital autorizada.
- **Despliegue listo para usar** (rescatado del borrador #54): imágenes publicadas en GHCR tras
  cada CI verde en `main` (se activa con la variable `VTP_API_DOMAIN`), `deploy.sh`, y la API con
  un rol de base de datos de mínimos privilegios (`vtp_app`) separado del dueño que migra. Prueba
  de dos confirmaciones simultáneas del mismo pago.
- **Varias ciudades: zonas operativas** (ADR-028). Cada ciudad o región se crea en
  `/admin/zones` y se activa, se marca como próxima o se pausa con un clic; solo las zonas activas
  venden pasajes y taxis. Cada zona puede tener su comisión y su moneda, y las paradas nuevas
  entran solas en su zona por la ubicación. Nuevo `GET /stops/nearby` para «paradas cerca de mí».
- **Copias de seguridad cifradas** con `infrastructure/backup/backup.sh` (base de datos y
  documentos KYC, 7 diarias, 4 semanales, 6 mensuales, copia opcional a otro proveedor) y
  `restore-check.sh` para probar la restauración ([guía](docs/deployment/backups.md)).
- **Pruebas del flujo de compra en el navegador**: búsqueda con precio y puestos libres, y la
  reserva pagada en la lista de pasajeros de la empresa.
- **Cabeceras de seguridad en la web** (contra _clickjacking_) y
  [revisión de seguridad](docs/deployment/security-review.md).

### Corregido

- Despacho: un viaje que el conductor marcó como llegado seguía ocupando el vehículo y al
  conductor hasta la llegada planificada; ahora quedan libres desde la llegada real.
- La API no arrancaba con el `apps/api/.env` recién creado por `pnpm env:init` (`MAIL_DELIVERY=`,
  `PUSH_DELIVERY=` y `PAYMENT_PROVIDER=` vacíos): un valor vacío ahora vale como no definido.
- Los formularios de inicio de sesión y de registro conservan lo escrito tras un error.
- Caddy permitía solo 1 MB por petición a la API: los documentos KYC no se podrían subir.
- `nodemailer` actualizado a 10.3.1 (avisos de seguridad).

- **Pruebas en el navegador en la CI.** Playwright prueba en Chromium (escritorio y teléfono) la
  portada, las páginas legales y el registro e inicio de sesión contra la API y la web reales.
- **Purga diaria de datos vencidos.** La API borra o anonimiza lo que superó su plazo de
  conservación (códigos, avisos, auditoría, sesiones muertas, datos de pasajeros y taxis antiguos,
  expedientes KYC rechazados o de cuentas borradas), según
  [conservación y borrado](docs/legal/conservacion-y-borrado.md).
- **Alertas de errores por correo** (`ALERT_EMAIL`, con límite de envíos) y guía de
  [monitoreo gratuito](docs/deployment/monitoring.md).
- **Mensajes de error claros en todas partes.** Los rechazos de cuentas, organizaciones,
  invitaciones, solicitudes KYC, paradas, rutas y mapas de puestos llevan ahora un `reason`
  estable con su texto en español, inglés y portugués (las apps ya no muestran el mensaje en
  inglés de la API).
- **Póliza RCV vencida bloquea la asignación.** En Despacho no se puede asignar un vehículo cuya
  póliza RCV esté vencida el día de la salida (`409 VEHICLE_INSURANCE_EXPIRED`); los demás
  documentos solo avisan.
- **Documentos legales, aceptación y borrar la cuenta.** Borradores de Términos y Condiciones,
  Política de Privacidad (con sección LGPD), Cancelación y Reembolsos, Condiciones para Empresas y
  Cookies en `docs/legal` (pendientes de revisión de un abogado), publicados en
  `/{idioma}/legal/…` con enlaces en el pie del sitio y en las apps. Aceptación obligatoria al
  registrarse (versión y fecha guardadas, `POST /me/terms` para nuevas versiones) y **Borrar mi
  cuenta** en el portal y en las dos apps (`DELETE /me`). Migraciones `0020` y `0021`.
- **La empresa cancela una salida.** En **Despacho**, con un motivo: se cancelan sus reservas, las
  pagadas se reembolsan completas (la plataforma conserva su comisión), cada pasajero recibe un
  aviso y la salida deja de venderse (`POST /organizations/:id/dispatch/cancel`). Migración `0019`.
- **Recuperar la contraseña.** «¿Olvidaste tu contraseña?» en la web y en las apps: un código al
  correo para elegir una nueva, que cierra las demás sesiones (`POST /auth/password/forgot` y
  `/reset`; no revela si un correo está registrado). Migración `0018`.
- **Cobro por empresa (ADR-027).** Un administrador elige, por empresa, si los pagos los recibe la
  plataforma (por defecto) o la empresa en sus propias cuentas. En ese caso la empresa carga sus
  cuentas, verifica los pagos y hace sus reembolsos en **Cobros** del portal (nuevo permiso
  `finance.manage`), y su saldo muestra la comisión que le debe a la plataforma, que se registra
  como un pago «de la empresa a la plataforma». Migración `0017`.
- **Pagos verificados a mano (ADR-027).** Con `PAYMENT_PROVIDER=manual` (nuevo valor por defecto
  en producción) el pasajero ve las cuentas de cobro de la plataforma, paga y escribe el número de
  operación; un administrador confirma o rechaza en **Pagos** del panel, donde también carga las
  cuentas. Los puestos quedan apartados hasta 6 horas mientras se verifica. Migración `0016`.
- **Avisos de revisiones e invitaciones.** Push y correo cuando la plataforma revisa una empresa o
  una solicitud KYC, cuando la empresa suma (o no) a un solicitante, y cuando alguien recibe una
  invitación (por correo aunque todavía no tenga cuenta). Migración `0015`.
- **Política de cancelación antes de pagar.** La reserva muestra en la app de pasajeros los
  tramos de reembolso de la empresa mientras está apartada y después de pagada (`refundPolicy` en
  la reserva).
- **Salida y llegada de cada viaje.** El conductor marca en su app la salida (desde 2 horas
  antes) y la llegada; la empresa lo ve en el despacho y en la lista de viajes, y desde la salida
  los pasajeros ya no pueden cancelar.
- **Documentos de los vehículos.** Certificado de circulación, póliza RCV y permiso de transporte
  con su número y vencimiento, en **Vehículos**; los vencidos o por vencer (30 días) se marcan en
  el portal y en el tablero de despacho.
- **Reportes y métricas.** Las empresas de autobuses ven en **Reportes** sus ventas (vendido,
  comisión, lo que ganan, cancelaciones y devoluciones) por ruta y por día, y la ocupación de cada
  salida (capacidad, vendidos, abordaron), para un rango de días, y los descargan en CSV. Los
  administradores de la plataforma tienen **Métricas**: ventas y comisión, reembolsos, usuarios
  nuevos, organizaciones activas y taxis. Ver
  [docs/architecture/reports.md](docs/architecture/reports.md).
- **Notificaciones por push y correo** (ADR-026). El pasajero recibe un push y un correo cuando se
  confirma su pago, cuando cancela un viaje pagado y cuando se le devuelve el dinero, y un
  recordatorio 3 horas antes de abordar. El conductor recibe un push cuando le asignan un viaje y
  cuando hay una solicitud de taxi en su terminal; el pasajero, cuando un taxi la acepta. Textos
  en español, inglés y portugués. Los códigos de acceso se pueden enviar por correo
  (`OTP_DELIVERY=email`). Correo por cualquier SMTP (`MAIL_DELIVERY`, `SMTP_*`; Mailpit en
  desarrollo con `pnpm infra:up:mail`) y push por el servicio de Expo (`PUSH_DELIVERY`). Las apps
  registran el teléfono al iniciar sesión; hace falta el proyecto de EAS para el push. Ver
  [docs/architecture/notifications.md](docs/architecture/notifications.md).
- **Cancelar un viaje pagado, con política de reembolso editable** (ADR-025). El pasajero ve en la
  app cuánto se le devuelve antes de cancelar; al cancelar se libera el puesto y el reembolso entra
  en la cola de la administración. La política general empieza en 8 % de comisión y reembolso del
  100 % hasta 48 h antes y del 50 % hasta 2 h antes; los administradores la editan en
  **Liquidaciones**, en general y por empresa. La plataforma conserva su comisión: el reembolso se
  descuenta de lo ganado por la empresa. No se puede cancelar después de abordar o de la salida.
  `PLATFORM_COMMISSION_PERCENT` ya no existe: la comisión se edita en la web.
- **Liquidaciones y reembolsos** (ADR-024). Cada reserva pagada anota lo que gana la empresa
  (tarifa menos comisión), en la moneda de la tarifa y en la misma transacción que la confirma.
  La comisión tiene un valor por defecto (`PLATFORM_COMMISSION_PERCENT`, 0 % hasta que se decida)
  y un administrador puede fijar otra por empresa; las reservas ya pagadas conservan la suya. Las
  empresas ven su saldo, sus reservas pagadas por mes y los pagos recibidos en el portal
  (permiso nuevo `finance.view`, dueño y administrador). Los administradores de la plataforma
  registran los pagos a las empresas (nunca más que el saldo; un error se anula) y atienden la
  cola de pagos por reembolsar, que pasan al estado nuevo `refunded` y el pasajero ve en la app.
  Los revisores de la plataforma no tocan el dinero. Ver
  [docs/architecture/settlements.md](docs/architecture/settlements.md).
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

- **Documentación al día** con liquidaciones, cancelaciones con reembolso y notificaciones: README,
  arquitectura, autenticación (códigos por correo), apps móviles (push), portal, organizaciones,
  idiomas, Docker y Mailpit (`VTP_MAIL_DELIVERY`), instalación local, Android (proyecto de EAS),
  preparación del VPS (SMTP y push), seguridad y hoja de ruta.
- **Documentos nuevos**: índice de la documentación (`docs/README.md`), guías de uso para
  pasajeros, empresas, conductores e inspectores y administración (`docs/guides/`), modelo de
  datos, guía de pruebas y glosario.
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

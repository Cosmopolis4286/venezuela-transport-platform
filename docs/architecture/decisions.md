# Decisiones de arquitectura

ADR livianos (registros de decisiones de arquitectura). Agrega una entrada nueva en lugar de
reescribir una vieja; marca las que quedan reemplazadas. Cada ADR describe lo que se decidió en su
momento, así que puede mencionar como futuro algo que ya existe.

## ADR-001: Un monorepo con apps separadas

**Decisión.** Un solo repositorio Git (`venezuela-transport-platform`) con un pnpm workspace y
Turborepo, con cada aplicación aislada en `apps/*`.

**Por qué.** Una persona (o un equipo pequeño) mantiene todo; los cambios de contrato de la API y
sus consumidores pueden entrar en un mismo PR; un solo pipeline de CI y un solo conjunto de
herramientas; no hay que sincronizar versiones entre repositorios. Turborepo solo corre las tareas
de los paquetes afectados y guarda en caché el resto.

**Compromisos.** La CI y las instalaciones abarcan más código; los permisos del repositorio son
todo o nada. Si una app necesita más adelante un equipo o un control de acceso aparte,
`git subtree split` puede extraerla.

**Descartado.** Cuatro repositorios (costo de sincronización sin beneficio actual).

## ADR-002: Repositorio separado de PlayRKE

La máquina en la que se preparó esto ya tenía el proyecto PlayRKE, que no tiene relación (Laravel

- Nuxt). Esta plataforma vive en su **propio** repositorio, para que ni el historial, ni la CI, ni
  las herramientas de un proyecto afecten al otro. No se copió nada de PlayRKE.

## ADR-003: Versiones del runtime y del gestor de paquetes

| Elección             | Por qué                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js **24 LTS**   | La LTS activa actual. Se descartó Node 22 porque `@nestjs/schematics` 12 exige `>=22.22.3` y la 24 tiene una ventana de soporte más larga.     |
| pnpm **10.34.x**     | Línea madura, soportada por completo por Expo, Turborepo y `pnpm/action-setup`. Existen pnpm 11 y 12; se actualizará a propósito más adelante. |
| TypeScript **6.0.x** | TypeScript 7 ya salió, pero `typescript-eslint` 8 soporta `<6.1`. Se revisará cuando agregue soporte para TS 7.                                |
| ESLint **9.39.x**    | ESLint 10 ya salió, pero `eslint-config-expo` depende de `eslint-plugin-react`/`-import`, que solo declaran soporte hasta ESLint 9.            |
| `catalog:` de pnpm   | Las versiones compartidas (TypeScript, React, ESLint, zod, vitest…) se declaran una sola vez en `pnpm-workspace.yaml`.                         |

## ADR-004: Versiones de los frameworks y generadores

Todas las apps se crearon con sus generadores oficiales (`create-next-app@16.4.2`,
`create-expo-app` con la plantilla `blank-typescript` del SDK 58, `@nestjs/cli@12`) y luego se
recortaron. Consecuencias importantes:

- **NestJS 12 es ESM** (`"type": "module"`, sufijos `.js` en los imports) y su CLI ahora genera
  **Vitest** en lugar de Jest; nos quedamos con Vitest. Su `oxlint` por defecto se reemplazó por
  ESLint para que todos los paquetes usen el mismo linter.
- **Next.js 16.4** usa Turbopack y `@tailwindcss/turbopack`; `cacheComponents` y
  `partialPrefetching` se dejan activados como vienen. Se quitaron las Google Fonts para que la
  compilación funcione sin conexión y no dependa de descargar fuentes de terceros.
- **Expo SDK 58** con Expo Router; las rutas viven en `src/app/`. Las carpetas nativas `ios/` y
  `android/` se generan (CNG) y están ignoradas por git.

## ADR-005: `node_modules` aislados de pnpm (sin hoisting)

La configuración de Metro del SDK 58 de Expo maneja la estructura aislada de pnpm; las dos apps se
verificaron con `expo export` para Android e iOS. Por eso **no** definimos `node-linker=hoisted`.
Si una biblioteca nativa futura falla con el aislamiento, cambiar a `node-linker=hoisted` en
`.npmrc` es la alternativa documentada.

## ADR-006: shadcn/ui instalado a mano

El entorno usado para la preparación inicial no llegaba a `ui.shadcn.com`, así que shadcn/ui se
configuró siguiendo su guía de instalación manual: `components.json`, `src/lib/utils.ts` (`cn`),
los tokens del tema en `globals.css` y el componente `Button`. La CLI funciona normalmente en una
red sin restricciones: `pnpm --filter @vtp/web exec shadcn add <componente>`.

## ADR-007: Drizzle ORM con migraciones SQL versionadas

_Reemplaza la decisión inicial de "posponer el ORM" del PR de la base del proyecto._

**Decisión.** Drizzle ORM (`drizzle-orm` 0.45) para las consultas y `drizzle-kit` 0.31 para
generar las migraciones SQL. Las migraciones las aplica nuestro propio ejecutor
(`apps/api/src/database/migrate.ts`, `pnpm db:migrate`), que usa el migrador de Drizzle y su tabla
`drizzle.__drizzle_migrations`.

**Por qué.** Las migraciones generadas son archivos SQL simples y revisables; las migraciones SQL
escritas a mano (`--custom`) cubren las funciones de PostGIS que el DSL del esquema no cubre; las
consultas quedan cerca de SQL y con tipos completos; no hay paso de generación de código ni un
binario de motor (a diferencia de Prisma, cuyo soporte de PostGIS es más débil). Kysely quedó en
segundo lugar; necesita una herramienta de migraciones aparte.

**Cómo funciona.**

| Pieza                             | Ubicación                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Tablas de los módulos             | `src/modules/<nombre>/<nombre>.schema.ts`, reexportadas desde `src/database/schema.ts`       |
| Migraciones                       | `apps/api/drizzle/NNNN_<nombre>.sql` + el diario y las instantáneas de `meta/` (súbelo todo) |
| Generar tras un cambio de esquema | `pnpm db:generate --name=<cambio>`                                                           |
| Migración SQL escrita a mano      | `pnpm --filter @vtp/api exec drizzle-kit generate --custom --name=<cambio>`                  |
| Aplicar                           | `pnpm db:migrate` (desarrollo) · `node dist/database/migrate.js` (imagen de producción)      |
| Consultar desde un módulo         | inyecta `DatabaseService` y usa `database.db` (Drizzle) o `database.pool` (SQL directo)      |

`0000_baseline_extensions.sql` crea `postgis`, `pgcrypto`, `citext` y `pg_trgm` con
`IF NOT EXISTS`, así las bases de datos de producción que nunca corrieron el SQL de inicialización
de Docker también las tienen. PostGIS no es una extensión de confianza: en bases de datos
administradas, puede que un administrador tenga que crearla primero.

La CI aplica las migraciones dos veces (idempotencia) y falla si `db:generate` produciría una
migración que no está en el repositorio (desfase del esquema).

**Reglas de las migraciones.**

- Las migraciones se suben al repositorio, se revisan como código, solo avanzan en producción y
  corren como un paso aparte del despliegue _antes_ de que arranque la nueva versión de la API
  (nunca automáticamente al arrancar la app).
- Nunca edites una migración que ya se aplicó en algún entorno compartido; agrega una nueva.
- `infrastructure/docker/postgres/init/` solo activa extensiones. Corre una vez sobre un volumen
  vacío y nunca debe contener tablas.
- Los cambios destructivos usan expandir → migrar los datos → contraer a lo largo de varias
  versiones.

## ADR-008: Redis opcional con un perfil de Compose

Redis está definido bajo el perfil `redis` y `pnpm infra:up` no lo arranca. BullMQ **no** está
instalado. Se agregará con el primer trabajo en segundo plano real (notificaciones,
liquidaciones). `REDIS_URL` se valida si está definida y se ignora si no.

## ADR-009: Configuración y secretos

- Cada app valida su propio entorno al arrancar (API: zod en `config/env.schema.ts`; web:
  `src/lib/env.ts`; móvil: `src/config/env.ts`).
- Los secretos solo existen del lado del servidor (API). Los valores `NEXT_PUBLIC_*` y
  `EXPO_PUBLIC_*` son **públicos por definición** — viajan dentro de los bundles del navegador y de
  los binarios de las apps.
- Producción lee variables de entorno reales; la API ignora los archivos `.env` cuando
  `NODE_ENV=production`.

## ADR-010: Herramientas de pruebas

Vitest para la API, los paquetes compartidos y las utilidades de la web; `jest-expo` para las apps
móviles (el camino soportado por Expo). Las pruebas e2e de la API usan Supertest contra la
configuración real de la app (`configureApp`) y, en la CI, un contenedor de servicio con PostGIS.

## ADR-011: Lo que deliberadamente no agregamos

Kubernetes, Terraform, microservicios, observabilidad de pago, una biblioteca de componentes
compartida entre la web y el móvil, GraphQL y un proveedor de autenticación. Cada uno necesita
antes un requisito concreto.

## ADR-012: Imágenes y Compose de referencia para producción

Dockerfiles multietapa sobre `node:24.22.0-trixie-slim` (glibc, así los módulos nativos no
necesitan recompilarse para musl) y un stack de Compose para un solo VPS con **Caddy** para HTTPS
automático. Se eligió sobre Nginx + certbot porque tiene menos piezas. Las imágenes se construyen
en la CI pero no se publican; publicar y desplegar necesita credenciales del registro y una
decisión explícita. Tamaño de las imágenes al crearlas: API ≈ 490 MB, web ≈ 390 MB (casi todo es la
imagen base de Node).

## ADR-013: Tokens de sesión opacos, contraseñas con scrypt y códigos de un solo uso

**Decisión.** Tokens de acceso y de renovación aleatorios y opacos, guardados como hashes HMAC en
una tabla `sessions`, en lugar de JWT. Contraseñas con el scrypt integrado de Node. Los pasajeros
pueden iniciar sesión con correo + contraseña o con códigos de un solo uso (SMS, WhatsApp,
correo); las cuentas del personal son los mismos usuarios, con membresías en organizaciones
agregadas por invitación o tras la aprobación KYC.

**Por qué.** Cada sesión se puede revocar de inmediato (cierre de sesión, suspensión, reutilización
del token) sin una lista de bloqueo; no hay que administrar claves de firma; la búsqueda por
solicitud es una consulta indexada, que está bien a esta escala y se puede cachear más adelante.
scrypt no necesita módulos nativos. Los códigos cubren a los usuarios sin correo, algo común entre
los pasajeros en Venezuela.

**Compromisos.** Cada solicitud autenticada consulta la base de datos; si eso se vuelve un cuello
de botella, se cachean las sesiones en Redis. Enviar códigos cuesta dinero por mensaje, por eso
tiene límites por destino y por IP, y queda `disabled` en producción hasta elegir un proveedor.

## ADR-014: Roles de organización en el código, invitaciones ligadas a contactos verificados

**Decisión.** Un solo enum de roles de organización, una lista de roles permitidos por tipo (las
líneas de taxis no tienen taquilleros ni inspectores) y una matriz rol → permiso definida en
`@vtp/shared-types`, aplicada por la API con una guardia de ruta. Las invitaciones apuntan a un
correo o teléfono, y las acepta un usuario con sesión que haya verificado ese contacto; no hay
enlaces ni tokens de invitación.

**Por qué.** Una matriz fija es fácil de revisar y probar, y alcanza para los roles conocidos; los
roles personalizados por empresa pueden llegar después si las empresas los piden. Las invitaciones
ligadas a un contacto no necesitan un secreto extra, funcionan antes de que exista un proveedor de
SMS o correo, y no le sirven a quien intercepte un mensaje.

**Compromisos.** Cambiar los permisos de un rol es un cambio de código y una nueva versión. Un rol
por membresía: una persona que despacha y también conduce necesita el rol más amplio (por ejemplo,
dueño o administrador) o ampliar la matriz.

## ADR-015: Solicitudes KYC con revisión de la plataforma y consentimiento de la organización

**Decisión.** Los conductores y el personal que no fueron invitados envían una solicitud con
documentos. Los revisores de la plataforma verifican la identidad y los documentos; si el
solicitante indicó una organización, esa organización luego lo acepta o lo rechaza. Los archivos
pasan por una interfaz `FileStorage`, por ahora en el disco local.

**Por qué.** El KYC es responsabilidad de la plataforma (verificaciones consistentes, un solo lugar
para los datos personales), mientras que contratar sigue siendo decisión de la organización. Una
interfaz de almacenamiento permite que el MVP corra en un VPS y pase a un almacenamiento compatible
con S3 sin tocar el código de negocio.

**Compromisos.** El almacenamiento local ata la API a un servidor, y su volumen debe respaldarse
junto con la base de datos. Todavía no hay verificación automática de identidad: los revisores
revisan los documentos a mano.

## ADR-016: Paquete de sesión móvil compartido, tokens en el llavero del dispositivo

**Decisión.** `packages/mobile-core` (`@vtp/mobile-core`) contiene el cliente de la API, el manejo
de la sesión, un pequeño kit de interfaz y las pantallas de inicio de sesión y registro que usan
las dos apps Expo. Metro lo consume como código fuente TypeScript (sin paso de compilación). Los
tokens se guardan con `expo-secure-store` (Keychain de iOS / Android Keystore,
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Las pantallas de cada funcionalidad se quedan dentro de cada
app.

**Por qué.** El inicio de sesión, la renovación de tokens y el almacenamiento seguro son sensibles
para la seguridad e idénticos en las dos apps; dos copias terminarían diferenciándose. Los tokens
de renovación rotan y una reutilización revoca la sesión, así que la lógica de renovación
serializada debe existir una sola vez y tener pruebas unitarias.

**Compromisos.** Un cambio en las pantallas compartidas llega en la siguiente versión de ambas
apps. `react` y `react-native` deben tener la misma versión en el paquete y en las apps, o Metro
empaqueta dos copias de React; el trabajo de bundles móviles de la CI no detectaría la duplicación,
así que mantenlos en el catálogo o fijados igual. La vista previa en el navegador
(`expo start --web`) no tiene almacenamiento seguro y guarda la sesión solo en memoria.

## ADR-017: Un módulo de red, salidas calculadas a partir de los horarios

**Decisión.** Paradas, rutas, tarifas y horarios viven en un módulo `network`. Las paradas son un
catálogo compartido administrado por el personal de la plataforma; las rutas guardan los minutos
de viaje desde el origen para cada parada; los horarios son recurrentes (hora, días de la semana,
vigencia). Las salidas se calculan al buscar en lugar de guardarse como viajes. Las tarifas son
por par de paradas, en `USD` o `VES`.

**Por qué.** Estos conceptos cambian juntos y son pequeños; módulos separados agregarían conexiones
sin límites reales. Un catálogo de paradas compartido es lo que hace posible buscar entre empresas.
Calcular las salidas mantiene al mínimo los datos que mantiene una empresa (un bus nocturno es una
fila, no 365), y los desfases de viaje hacen exactas las horas nocturnas y de paradas intermedias.

**Compromisos.** Todavía no hay estado por viaje: cancelar una salida concreta o apartar puestos
necesita un registro de viaje, que agregarán las reservas (generado con el mismo cálculo). Las
empresas dependen del personal para agregar las paradas que falten. Los precios no se convierten
entre monedas.

## ADR-018: La plataforma cobra los pagos, verificados automáticamente mediante adaptadores de proveedores

**Decisión.** Los pasajeros le pagan a la plataforma, no a la empresa, por pago móvil,
transferencia bancaria, PIX o USDT. Los pagos se confirman automáticamente: cada método es un
adaptador `PaymentProvider` detrás de una sola interfaz (crear la instrucción de pago, recibir o
consultar su confirmación). Hasta que se contraten proveedores reales, un **proveedor simulado**
mueve todo el flujo en desarrollo y en las pruebas. Los montos se convierten con una tasa de
cambio que fija cada empresa y se congelan al hacer la reserva. La plataforma lleva un registro de
lo que le debe a cada empresa (tarifas menos comisión). Los puestos se eligen en el mapa de
puestos de la empresa (`fleet`).

**Por qué.** Lo decidió el dueño del producto. Un solo pago para todas las empresas, un solo lugar
para verificar los pagos y emitir los boletos, y un modelo de comisión. Los adaptadores mantienen
reemplazable cada banco, institución PIX o vigilante de blockchain, y sus credenciales solo en la
configuración del servidor.

**Compromisos y requisitos previos.** La verificación real necesita contratos y acceso a las APIs
de los proveedores (un banco o pasarela venezolana para pago móvil y transferencias, una
institución PIX y una billetera en una red elegida para USDT); sus claves van en variables de
entorno, nunca en el código ni en un chat. Cobrar dinero por cuenta de terceros y aceptar
criptomonedas puede requerir registros o licencias en Venezuela y Brasil: hace falta una revisión
legal antes de producción. La plataforma también asume la conciliación, los reembolsos y los pagos
a las empresas.

## ADR-019: CircleCI para los pipelines

**Decisión.** La integración continua corre en CircleCI (`.circleci/config.yml`) en lugar de
GitHub Actions, por decisión del dueño del producto. Los trabajos son los mismos de antes:
calidad, pruebas e2e de la API con PostGIS, bundles móviles e imágenes de producción. La
configuración no usa orbs, solo pasos de shell sobre la imagen oficial `node:24.22.0-trixie` (el
mismo Node que `.nvmrc` y producción) y una máquina virtual `machine` para construir con Docker.

**Por qué.** Los pipelines del equipo viven en CircleCI. Usar shell simple mantiene la
configuración legible, hace que cada paso se pueda reproducir en local
(`docker run node:24.22.0-trixie …`) y evita código de orbs de terceros con acceso a la
compilación.

**Compromisos.** El dueño del repositorio debe conectar el proyecto de CircleCI y configurar los
checks obligatorios en GitHub. La imagen de Node se fija a mano (Dependabot no actualiza la
configuración de CircleCI). Los executors `machine` cuestan más créditos que los de Docker.

## ADR-020: Viajes creados bajo demanda; puestos ocupados durante todo el viaje

**Decisión.** La fila de un viaje (horario + fecha de servicio) se crea con la primera reserva y
guarda una copia del mapa de puestos. Los puestos se apartan por `BOOKING_HOLD_MINUTES` y quedan
ocupados durante todo el viaje. Un índice único parcial sobre las filas activas `(viaje, puesto)`
es la garantía contra la doble venta; los apartados vencidos se liberan al vuelo en lugar de con
un trabajo en segundo plano.

**Por qué.** Las salidas siguen calculándose (ADR-017) y solo las reservadas tienen estado. El
índice de la base de datos resiste la concurrencia sin bloqueos en la aplicación. La expiración al
vuelo no necesita un programador de tareas en un solo VPS.

**Compromisos.** Un puesto liberado en una parada intermedia no se revende. Los conteos de las
lecturas públicas filtran por `expiresAt`, así que las filas vencidas quedan hasta que la siguiente
reserva de ese viaje las toque; se puede agregar una limpieza periódica cuando exista un ejecutor
de trabajos.

## ADR-021: Montos congelados por pago; los boletos son ids aleatorios en un QR

**Decisión.** El monto convertido y la tasa se congelan cuando el pasajero elige un método de pago
(no al apartar los puestos), así un cambio de tasa durante el apartado solo se aplica a una nueva
elección. El dinero solo confirma una reserva mientras siga `held`, incluido un apartado vencido
cuyos puestos todavía no se liberaron; cualquier otro dinero queda como `refund_due`. Sin
proveedores reales, la API usa un **proveedor simulado** que la configuración de producción
rechaza. El QR de un boleto lleva `VTP1.<id aleatorio>`, que los inspectores de la empresa validan
en línea; el primer escaneo marca el abordaje.

**Por qué.** La tasa que ve el pasajero es la tasa que se cobra. Confirmar solo reservas apartadas
mantiene la garantía de puestos del ADR-020 sin reservar puestos después de su apartado. Un id
aleatorio en el QR no lleva datos personales ni necesita una clave de firma; la validación en línea
es lo que detecta los QR copiados.

**Compromisos.** Los reembolsos son manuales hasta que existan las liquidaciones. La validación
necesita conexión; escanear sin conexión necesitaría QR firmados y sincronizar los abordajes. Los
pagos simulados nunca deben activarse donde reservan pasajeros reales.

## ADR-022: Un runner propio de GitHub Actions junto a CircleCI

> Reemplazado en parte por ADR-023: el runner propio queda solo para ejecuciones manuales.

**Decisión.** `.github/workflows/self-hosted-ci.yml` corre los trabajos de CircleCI en un runner de
GitHub Actions instalado en la computadora Windows del mantenedor, dentro de Ubuntu en WSL 2 con
Docker Desktop. Los trabajos usan los mismos contenedores que CircleCI (`node:24.22.0-trixie`,
`postgis/postgis:18-3.6`) y solo corren en runners con la etiqueta `vtp`; los pull requests de
forks nunca corren en él. CircleCI sigue como pipeline en la nube (ADR-019); el dueño elige qué
checks son obligatorios.

**Por qué.** Se acabaron los créditos de la CI en la nube. GitHub no cobra minutos por los runners
propios, los trabajos quedan idénticos y no hay que alojar nada más. Hace falta WSL porque GitHub
solo corre contenedores de trabajo y de servicio en runners Linux.

**Compromisos.** Los checks solo corren mientras la computadora está encendida; los trabajos corren
uno tras otro. El runner ejecuta el código de los pull requests en una computadora personal, así
que el repositorio debe seguir siendo privado y se saltan los pull requests de forks. Dependabot
vuelve a vigilar las versiones de las acciones.

## ADR-023: CI en las máquinas de GitHub; el repositorio es público

**Decisión.** El repositorio se hizo público y la CI principal pasó a
`.github/workflows/ci.yml`, que corre los mismos cuatro trabajos en las máquinas de GitHub
(`ubuntu-latest`) con los mismos contenedores. El runner propio (ADR-022) queda solo para
ejecuciones manuales (`workflow_dispatch`). CircleCI sigue configurado pero ya no es necesario.

**Por qué.** GitHub no cobra minutos de Actions en repositorios públicos, así que la CI corre en
cada pull request sin depender de una computadora encendida ni de créditos. Además se activan
gratis el escaneo de secretos con bloqueo al hacer push y el análisis de código.

**Compromisos.** El código y la documentación son públicos y quedan archivados por terceros aunque
el repositorio vuelva a ser privado. Nunca debe subirse un secreto (el historial se revisó antes de
publicarlo y estaba limpio). Los pull requests de forks corren en máquinas desechables de GitHub,
con un token de solo lectura y sin secretos; GitHub desaconseja construirlos en runners propios
de repositorios públicos, por eso el runner propio ya no se activa con pull requests.

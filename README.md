# Venezuela Transport Platform (VTP)

Plataforma venezolana de transporte terrestre que conecta a pasajeros, empresas de autobuses,
terminales, taxistas y operadores de transporte.

> **Estado: en desarrollo, sin desplegar.** El flujo de venta de boletos funciona de punta a
> punta: búsqueda de viajes, puestos en el mapa del bus, pago (proveedor simulado), boletos QR,
> escaneo al abordar, asignación de vehículo y conductor, y taxis desde y hacia los terminales. **Todavía no: proveedores de pago reales, liquidaciones, reembolsos,
> notificaciones ni cobro de los taxis en la app.** No la despliegues con usuarios ni datos reales. Progreso
> y pendientes: [hoja de ruta](docs/roadmap.md) · historial: [CHANGELOG](CHANGELOG.md) · CI:
> CircleCI y un runner propio ([flujo del repositorio](docs/development/repository-workflow.md)).

## Qué hace hoy

| App                                             | Para                                             | Funciones                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (`apps/web`)                                | Pasajeros                                        | Búsqueda de viajes (`/buscar`) con puestos libres                                                                                                          |
| Portal (`apps/web`, `/portal`)                  | Empresas de autobuses, líneas de taxis, personal | Equipo e invitaciones, solicitantes, rutas, tarifas, horarios, mapas de puestos, vehículos, despacho, taxis, tasas de cambio, viajes y listas de pasajeros |
| Panel de administración (`apps/web`, `/admin`)  | Personal de la plataforma                        | Aprobar organizaciones y solicitudes KYC, catálogo de paradas                                                                                              |
| App de pasajeros (`apps/passenger-mobile`)      | Pasajeros                                        | Búsqueda, puestos en el mapa del bus, apartar y pagar, boletos QR, "Mis viajes", pedir un taxi                                                             |
| App de transportistas (`apps/transport-mobile`) | Conductores, inspectores, personal               | Invitaciones, solicitud KYC, escáner de boletos al abordar, viajes asignados al conductor                                                                  |

## La arquitectura de un vistazo

Un repositorio Git (pnpm workspace + Turborepo) con **aplicaciones separadas** dentro:

| Ruta                                                   | Qué                                                                       | Tecnología                                     | URL / puerto de desarrollo      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| `apps/web`                                             | Web pública, búsqueda de autobuses, portal de empresas (`/portal`)        | Next.js 16 (App Router), Tailwind 4, shadcn/ui | http://localhost:3000           |
| `apps/passenger-mobile`                                | App de pasajeros                                                          | Expo SDK 58, Expo Router                       | Metro en :8081                  |
| `apps/transport-mobile`                                | Conductores, empresas de transporte, operadores de terminal               | Expo SDK 58, Expo Router                       | Metro en :8082                  |
| `apps/api`                                             | API REST compartida — monolito modular                                    | NestJS 12, OpenAPI/Swagger                     | http://localhost:4000/api/v1    |
| `packages/shared-types`                                | Contratos de la API, independientes de cualquier framework                | TypeScript                                     | —                               |
| `packages/mobile-core`                                 | Sesión, cliente de la API y pantallas de inicio de sesión de las dos apps | React Native (código fuente TypeScript)        | —                               |
| `packages/eslint-config`, `packages/typescript-config` | Configuraciones compartidas de lint y compilador                          | —                                              | —                               |
| `docker-compose.yml`                                   | PostgreSQL 18 + PostGIS 3.6, Redis 8.10 opcional; API y web opcionales    | Docker Compose                                 | 127.0.0.1:5432 / 127.0.0.1:6379 |

Swagger UI: http://localhost:4000/api/docs · OpenAPI JSON: http://localhost:4000/api/docs-json

Más detalle: [visión general de la arquitectura](docs/architecture/overview.md) ·
[decisiones y compromisos](docs/architecture/decisions.md).

## Requisitos

| Herramienta         | Versión                                                               | Notas                                                                             |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Node.js             | 24 LTS (`>=24.15 <25`)                                                | Hay un `.nvmrc` — `nvm use` / `fnm use`                                           |
| pnpm                | 10.34.7                                                               | `corepack enable` toma la versión fijada automáticamente                          |
| Docker + Compose v2 | Docker 24+ / Compose 2.20+                                            | Para la base de datos (y opcionalmente la API y la web). No hace falta para Expo. |
| Git                 | 2.40+                                                                 |                                                                                   |
| Móvil (opcional)    | Expo Go, emulador de Android Studio o simulador de Xcode (solo macOS) | Ver [instalación local](docs/development/local-setup.md#apps-móviles)             |

## Inicio rápido

```bash
corepack enable                 # una vez por computadora
pnpm install                    # instala desde pnpm-lock.yaml
pnpm env:init                   # crea los .env desde las plantillas (nunca sobrescribe)
pnpm infra:up                   # PostgreSQL + PostGIS, espera a que esté sano
pnpm db:check                   # → "OK: PostgreSQL 18.x, PostGIS 3.6.x ..."
pnpm db:migrate                 # aplica las migraciones SQL (idempotente)
pnpm dev                        # web (:3000) + API (:4000)
curl http://localhost:4000/api/v1/health
```

Instrucciones completas por sistema operativo:
[docs/development/local-setup.md](docs/development/local-setup.md). Para correr la API y la web en
Docker: [docs/development/docker.md](docs/development/docker.md).

## Comandos

Todos los comandos se ejecutan desde la raíz del repositorio.

| Tarea                                                    | Comando                                                   |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Instalar dependencias (desde el lockfile)                | `pnpm install` (CI: `pnpm install --frozen-lockfile`)     |
| Crear los archivos de entorno locales                    | `pnpm env:init`                                           |
| Correr la web + la API                                   | `pnpm dev`                                                |
| Correr todo (web, API, los dos Metro)                    | `pnpm dev:all`                                            |
| Correr solo la web                                       | `pnpm dev:web`                                            |
| Correr solo la API                                       | `pnpm dev:api`                                            |
| Correr solo la app de pasajeros                          | `pnpm dev:passenger`                                      |
| Correr solo la app de transportistas                     | `pnpm dev:transport`                                      |
| Lint                                                     | `pnpm lint`                                               |
| Verificar tipos                                          | `pnpm typecheck`                                          |
| Pruebas unitarias                                        | `pnpm test`                                               |
| Pruebas e2e de la API (necesitan la base de datos)       | `E2E_EXPECT_DATABASE=true pnpm test:e2e`                  |
| Lint + tipos + pruebas                                   | `pnpm check`                                              |
| Formatear / comprobar el formato                         | `pnpm format` / `pnpm format:check`                       |
| Compilar la web + la API (+ paquetes compartidos)        | `pnpm build` (o `pnpm build:web`, `pnpm build:api`)       |
| Arrancar la base de datos                                | `pnpm infra:up`                                           |
| Híbrido: base de datos + API en Docker                   | `pnpm stack:api` y luego `pnpm dev:web`                   |
| Todo en Docker (base de datos, API, web)                 | `pnpm stack:app` (detener: `pnpm stack:down`)             |
| Arrancar la base de datos + Redis                        | `pnpm infra:up:redis`                                     |
| Detener la infraestructura (conserva los datos)          | `pnpm infra:down`                                         |
| Estado / logs de los contenedores                        | `pnpm infra:ps` / `pnpm infra:logs`                       |
| Comprobar la conexión a la base de datos y PostGIS       | `pnpm db:check`                                           |
| Aplicar las migraciones                                  | `pnpm db:migrate`                                         |
| Generar una migración tras cambiar el esquema            | `pnpm db:generate --name=<cambio>`                        |
| Abrir `psql` en el contenedor                            | `pnpm db:psql`                                            |
| Dar un rol de personal de la plataforma                  | `pnpm platform:grant --email tu@ejemplo.com --role admin` |
| **Borrar** los datos locales de la base de datos y Redis | `pnpm infra:reset` (pide confirmación)                    |

> ⚠️ `pnpm infra:reset` ejecuta `docker compose down --volumes`. Borrar los volúmenes de Docker
> **elimina para siempre todos los datos locales de la base de datos.** Antes te pide escribir
> `vtp`.

Redis es opcional y está apagado por defecto; nada del flujo normal de `pnpm dev` lo necesita.

## Endpoints de salud

| Endpoint                   | Significado                         | Códigos   |
| -------------------------- | ----------------------------------- | --------- |
| `GET /api/v1/health`       | Vida: el proceso está arriba        | 200       |
| `GET /api/v1/health/ready` | Disponibilidad: PostgreSQL responde | 200 / 503 |

## Problemas frecuentes

| Síntoma                                                         | Solución                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_PNPM_UNSUPPORTED_ENGINE`                                   | Usa Node 24 (`nvm use`) y ejecuta `corepack enable`.                                                                                                                                  |
| La API termina con `Invalid environment configuration`          | El mensaje lista cada variable incorrecta por su nombre. Ejecuta `pnpm env:init` y compara con `apps/api/.env.example`.                                                               |
| La API termina con `AUTH_SECRET: Invalid input` tras actualizar | Tu `apps/api/.env` es anterior a la autenticación. Copia las líneas `AUTH_*` y `OTP_*` de `apps/api/.env.example`.                                                                    |
| `/health/ready` devuelve 503                                    | La base de datos está caída o las credenciales no coinciden: `pnpm infra:ps`, `pnpm db:check`. `POSTGRES_*` del `.env` de la raíz debe coincidir con `DATABASE_*` de `apps/api/.env`. |
| El puerto 5432 ya está en uso                                   | Hay un PostgreSQL local corriendo. Pon `POSTGRES_PORT=5433` en `.env` **y** `DATABASE_PORT=5433` en `apps/api/.env`.                                                                  |
| Cambié `POSTGRES_PASSWORD` pero el inicio de sesión falla       | La contraseña solo se aplica al crear el volumen por primera vez. Cámbiala dentro de PostgreSQL o reinicia los datos locales (`pnpm infra:reset`).                                    |
| La app móvil no llega a la API                                  | En un teléfono o emulador, `localhost` es el propio dispositivo. Ver [red en el móvil](docs/development/local-setup.md#apps-móviles).                                                 |
| El navegador bloquea por CORS                                   | Agrega el origen exacto a `CORS_ORIGINS` en `apps/api/.env`.                                                                                                                          |
| Metro sirve código viejo tras cambiar dependencias              | `pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`                                                                                                             |

## Documentación

- [Progreso y hoja de ruta](docs/roadmap.md) · [Registro de cambios](CHANGELOG.md)
- [Visión general de la arquitectura](docs/architecture/overview.md)
- [Decisiones de arquitectura](docs/architecture/decisions.md)
- [Autenticación](docs/architecture/authentication.md)
- [Organizaciones, roles e invitaciones](docs/architecture/organizations.md)
- [Solicitudes de conductores y personal (KYC)](docs/architecture/onboarding.md)
- [Portal web y panel de administración](docs/architecture/web-portal.md)
- [Apps móviles](docs/architecture/mobile-apps.md)
- [Red de transporte: paradas, rutas, tarifas, horarios](docs/architecture/network.md)
- [Flota: mapas de puestos](docs/architecture/fleet.md)
- [Reservas: viajes y puestos apartados](docs/architecture/bookings.md)
- [Pagos y boletos](docs/architecture/payments.md)
- [Despacho: vehículos y conductores de cada viaje](docs/architecture/dispatch.md)
- [Taxis desde y hacia los terminales](docs/architecture/taxis.md)
- [Instalación local (Windows, macOS, Linux)](docs/development/local-setup.md)
- [Correr con Docker: local, híbrido, completo](docs/development/docker.md)
- [Probar en Android: Expo Go, emulador, APK](docs/development/android-testing.md)
- [Variables de entorno](docs/development/environment-variables.md)
- [Flujo del repositorio](docs/development/repository-workflow.md) ·
  [Runner de CI propio](docs/development/self-hosted-runner.md)
- [Preparación del despliegue en un VPS](docs/deployment/vps-preparation.md)
- [Cómo contribuir](CONTRIBUTING.md) · [Política de seguridad](SECURITY.md)

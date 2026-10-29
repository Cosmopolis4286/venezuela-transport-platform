# Visión general de la arquitectura

## Contexto

La plataforma conecta a pasajeros, empresas de autobuses, terminales, taxistas y operadores de
transporte en Venezuela: búsqueda de autobuses, reservas y boletos con validación por QR,
disponibilidad de puestos, despacho de taxis desde y hacia los terminales, pagos y liquidaciones,
notificaciones, reportes y roles por organización. Lo que está construido y lo que falta se sigue
en la [hoja de ruta](../roadmap.md). Este documento describe los límites entre módulos que sigue
cada funcionalidad.

## Diagrama del sistema

```
 ┌────────────────────┐  ┌────────────────────────┐  ┌──────────────────────────┐
 │ apps/web (Next.js) │  │ apps/passenger-mobile   │  │ apps/transport-mobile    │
 │  /        público  │  │ (Expo, pasajeros)       │  │ (Expo, conductores y     │
 │  /portal  empresas │  │                         │  │  operadores)             │
 └─────────┬──────────┘  └───────────┬────────────┘  └────────────┬─────────────┘
           │        HTTPS · JSON · /api/v1/*  (contratos compartidos: @vtp/shared-types)
           └─────────────────────────┼────────────────────────────┘
                                     ▼
                     ┌──────────────────────────────────┐
                     │ apps/api — monolito modular NestJS │
                     │  configuración · logs · validación │
                     │  modules/* (identidad, reservas…)  │
                     └───────────┬──────────────┬───────┘
                                 ▼              ▼ (opcional, más adelante)
                     PostgreSQL 18 + PostGIS    Redis 8 / BullMQ
```

## Aplicaciones

| App                     | Público                                                      | Responsabilidad                                                                                                                                                                                                                                                 | Habla con                    |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `apps/web`              | Visitantes; personal de empresas de autobuses y terminales   | Sitio público y búsqueda de autobuses (grupo de rutas `(public)`), portal de empresas en `/portal` con su propio layout. Las áreas con sesión `/portal` y `/admin` las protegen `src/proxy.ts` y las verificaciones de la API ([web-portal.md](web-portal.md)). | La API por HTTPS             |
| `apps/passenger-mobile` | Pasajeros                                                    | Búsqueda de viajes, reserva de puestos, pago, boletos QR, taxis desde y hacia los terminales y cuenta ([mobile-apps.md](mobile-apps.md))                                                                                                                        | La API por HTTPS             |
| `apps/transport-mobile` | Taxistas, tripulaciones de autobuses, operadores de terminal | Inicio de sesión, invitaciones, solicitud KYC con documentos, validación de boletos QR, viajes asignados al conductor y solicitudes de taxi                                                                                                                     | La API por HTTPS             |
| `apps/api`              | Todos los clientes                                           | Única fuente de verdad de las reglas de negocio, la autorización y los datos                                                                                                                                                                                    | PostgreSQL, Redis (opcional) |

Reglas:

- **Los clientes nunca hablan con la base de datos ni entre sí.** Todo pasa por la API.
- **Las dos apps móviles se mantienen separadas.** Distintos usuarios, permisos, ritmo de
  publicación y fichas en las tiendas. Además de los _contratos_ (`@vtp/shared-types`), solo
  comparten el manejo de la sesión, el cliente de la API y las pantallas de inicio de sesión
  (`@vtp/mobile-core`, [ADR-016](decisions.md)); cada pantalla de funcionalidad vive en su propia
  app ([mobile-apps.md](mobile-apps.md)).
- **La web y el móvil no comparten componentes de interfaz.** Los componentes de React DOM y React
  Native son distintos; compartirlos ataría sus ciclos de publicación a cambio de poco.
- La web pública y el portal de empresas comparten una app Next.js pero usan árboles de rutas y
  layouts separados, así pueden tener middleware de autenticación distinto sin un despliegue
  aparte.

## Backend: monolito modular

Un solo proceso NestJS desplegable, dividido por dentro en módulos con límites explícitos.

```
apps/api/src/
├── main.ts               # arranque: escuchar, mostrar las URLs
├── app.setup.ts          # prefijo /api, versionado por URI, validación, filtro de errores, CORS, Swagger
├── app.module.ts         # conecta configuración, logger, base de datos y módulos de funcionalidad
├── cli/                  # comandos de servidor (platform-grant)
├── common/               # transversal: filters/, pipes/, interceptors/, errors/
├── config/               # esquema de entorno (zod), AppConfigService tipado, configuración de logs
├── database/             # Drizzle ORM sobre un pool de pg, migraciones, schema.ts que reúne las tablas
├── docs/                 # configuración de OpenAPI/Swagger
├── storage/              # FileStorage (documentos KYC)
└── modules/              # audit, health, identity, organizations, onboarding, network,
                          # fleet, bookings, payments
```

### Agregar un módulo de funcionalidad

Módulos, aproximadamente en orden de dependencia:

| Módulo             | Es dueño de                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `identity` ✅      | Usuarios, credenciales, sesiones y tokens, códigos de un solo uso ([authentication.md](authentication.md))                                             |
| `organizations` ✅ | Empresas de autobuses, líneas de taxis y terminales; membresías, roles, invitaciones, revisión de la plataforma ([organizations.md](organizations.md)) |
| `onboarding` ✅    | Solicitudes de conductores y personal, documentos KYC, revisión de la plataforma, aceptación de la organización ([onboarding.md](onboarding.md))       |
| `network` ✅       | Catálogo de paradas (terminales y paradas, PostGIS), rutas, tarifas, horarios recurrentes, búsqueda pública de salidas ([network.md](network.md))      |
| `fleet` ✅         | Mapas de puestos por tipo de vehículo y vehículos de cada empresa ([fleet.md](fleet.md))                                                               |
| `bookings` ✅      | Viajes, puestos apartados, listas de pasajeros, validación de boletos al abordar ([bookings.md](bookings.md))                                          |
| `payments` ✅      | Tasas de cambio, pagos mediante adaptadores de proveedores, confirmación de reservas ([payments.md](payments.md)); las liquidaciones vienen después    |
| `dispatch` ✅      | Asignación de vehículo y conductor a cada viaje, viajes del conductor ([dispatch.md](dispatch.md))                                                     |
| `taxi` ✅          | Taxis desde y hacia los terminales: solicitudes, la línea que las toma, ciclo de vida del viaje ([taxis.md](taxis.md))                                 |
| `notifications`    | Envío de SMS / push / correo, plantillas                                                                                                               |
| `reporting`        | Modelos de lectura y exportaciones para las empresas                                                                                                   |

Convenciones para cada módulo nuevo (`apps/api/src/modules/<nombre>/`):

1. `<nombre>.module.ts`, controladores, servicios, DTO (`class-validator`) y pruebas junto al
   código.
2. **Un módulo expone una API de servicio mediante `exports`; los demás módulos solo usan eso.**
   Nada de meterse en las tablas o los providers internos de otro módulo para escribir. Si dos
   módulos necesitan los mismos datos, uno es el dueño y el otro los pide a través de su servicio
   exportado.
3. Cada módulo es dueño de sus tablas. Las claves foráneas entre módulos solo se permiten hacia
   los identificadores del módulo dueño (por ejemplo, `organization_id`).
4. Los controladores declaran `version: '1'`; los DTO que viajan por la red tienen un tipo de
   contrato equivalente en `@vtp/shared-types` en cuanto un cliente los consume.
5. Registra el módulo en `app.module.ts` y agrega una prueba e2e de sus endpoints principales.
6. Separa un módulo en su propio servicio **solo** con evidencia (escalado independiente, equipo
   propio, aislamiento de fallos). Unos límites limpios entre módulos mantienen esa opción barata.

### Comportamiento transversal que ya existe

| Aspecto                 | Implementación                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versionado              | Prefijo global `api` + versionado por URI, `v1` por defecto → `/api/v1/...`                                                                                                                                                                     |
| Validación              | `ValidationPipe` global: lista blanca, rechazo de campos desconocidos, transformación; nunca devuelve los valores                                                                                                                               |
| Errores                 | `HttpExceptionFilter` → `ApiErrorResponse` (`packages/shared-types/src/api/errors.ts`)                                                                                                                                                          |
| Configuración           | Esquema `zod` validado al arrancar; el proceso termina listando los nombres de las variables inválidas                                                                                                                                          |
| Logs                    | `nestjs-pino`: JSON en producción, legible en desarrollo; ids de solicitud (`x-request-id`); cabeceras de autenticación y cookies ocultas; no se registran query strings ni cuerpos                                                             |
| CORS                    | Lista explícita de orígenes en `CORS_ORIGINS`; `*` se rechaza en producción                                                                                                                                                                     |
| Documentación de la API | Swagger en `/api/docs`, activo por defecto fuera de producción                                                                                                                                                                                  |
| Apagado                 | `enableShutdownHooks()`; el pool de la base de datos se cierra con SIGTERM/SIGINT                                                                                                                                                               |
| Salud                   | `/api/v1/health` (vida), `/api/v1/health/ready` (base de datos lista, 503 si está caída)                                                                                                                                                        |
| Cabeceras de seguridad  | Valores por defecto de `helmet` (CSP, HSTS, nosniff, frame-ancestors…); sin `x-powered-by`                                                                                                                                                      |
| Límite de solicitudes   | Guardia global de `@nestjs/throttler` por IP de cliente (`RATE_LIMIT_*`); las sondas de salud quedan exentas con `@SkipThrottle()`. Almacén en memoria: pásalo a Redis antes de correr más de una instancia de la API                           |
| Proxies                 | `trust proxy` según `API_TRUST_PROXY_HOPS`, para que las IPs de los clientes sean correctas detrás de Caddy/Nginx                                                                                                                               |
| Autenticación           | `AuthGuard` global: cada ruta exige un token de acceso bearer salvo que esté marcada con `@Public()`. Ver [authentication.md](authentication.md)                                                                                                |
| Autorización            | `@RequireOrganizationAccess(permiso)` resuelve `:organizationId` a la membresía de quien llama (404 si no es miembro, 403 sin el permiso); `@RequirePlatformRole()` para el personal de la plataforma. Ver [organizations.md](organizations.md) |
| Registro de auditoría   | `AuditService.record()` → `audit_events` (solo identificadores, nunca secretos ni datos personales en bruto)                                                                                                                                    |

**Todavía no existen (no asumas que están):** notificaciones (no hay proveedor de SMS ni correo),
almacenamiento de archivos en la nube, trabajos en segundo plano.

## Datos

- **PostgreSQL 18 + PostGIS 3.6.** PostGIS cubre la ubicación de los terminales, la geometría de
  las rutas y las consultas del taxi más cercano sin un servicio geográfico aparte.
- Extensiones activadas en la primera inicialización: `postgis`, `pgcrypto`, `citext`, `pg_trgm`
  (`infrastructure/docker/postgres/init/001-extensions.sql`).
- Zona horaria: los contenedores corren en `America/Caracas`; **las fechas se guardan como
  `timestamptz`** y se convierten en los extremos.
- Los cambios de esquema pasan por migraciones SQL versionadas en el repositorio, generadas con
  drizzle-kit y aplicadas con `pnpm db:migrate` — ver las
  [decisiones](decisions.md#adr-007-drizzle-orm-con-migraciones-sql-versionadas). Cada módulo es
  dueño de sus tablas en `src/modules/<nombre>/<nombre>.schema.ts`.

## Contratos compartidos (`@vtp/shared-types`)

- TypeScript puro: sin imports de React, React Native, Next.js ni NestJS, sin dependencias en
  tiempo de ejecución.
- Solo contiene contratos de la red: formas de solicitudes y respuestas, códigos de error,
  constantes de versión de la API y funciones de presentación compartidas. **No** entidades,
  modelos del ORM ni tipos internos de los servicios.
- Se compila a `dist/` (ESM + `.d.ts`); Turbo lo compila antes que cualquier paquete que dependa
  de él (`dependsOn: ["^build"]`).

### Convención de errores

Toda respuesta que no sea 2xx tiene este cuerpo:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "email must be an email" }],
    "requestId": "8f0c…",
    "timestamp": "2026-10-17T12:00:00.000Z"
  }
}
```

Los clientes deciden según `code` (una lista cerrada, `API_ERROR_CODES`), muestran `message` y
enseñan `requestId` en los flujos de soporte. `isApiErrorResponse()` es una comprobación en tiempo
de ejecución para los clientes.

Cuando `code` no basta para saber qué pasó (casi siempre un `CONFLICT`), la respuesta trae además
**`reason`**, un valor estable de `API_ERROR_REASONS`, por ejemplo `"reason": "SEAT_TAKEN"`. Los
clientes lo traducen con `API_ERROR_REASON_MESSAGES` (español) y **nunca** comparan el texto de
`message`, que puede cambiar. En la API: `throw ApiException.conflict('Mensaje', 'SEAT_TAKEN')`.
Agregar un `reason` es compatible hacia atrás; quitarlo o renombrarlo, no.

### Evolución de los contratos

- **Los cambios que solo agregan** (un campo opcional nuevo, un endpoint nuevo, un código de error
  nuevo) se pueden hacer dentro de `v1`.
- **Los cambios que rompen** (quitar o renombrar un campo, cambiar un tipo, volver obligatorio un
  campo de una solicitud) necesitan una nueva versión del endpoint (`version: '2'`) o un cambio
  coordinado que actualice la API y a todos sus consumidores en el mismo PR — y, para el móvil,
  solo cuando las versiones viejas de la app en la calle ya no se soporten. **Asume que los
  clientes móviles van semanas atrasados.**
- OpenAPI (generado desde los controladores de NestJS) es la referencia externa; los tipos
  compartidos son la comodidad interna en TypeScript. Considera generar uno a partir del otro
  cuando la API crezca.

## Comunicación

- REST/JSON por HTTPS, versionado bajo `/api/v1`.
- WebSockets solo cuando una funcionalidad necesite que el servidor empuje datos (por ejemplo, la
  posición de un taxi en vivo). Consultar periódicamente es aceptable en las primeras versiones.
- Trabajo en segundo plano (notificaciones, liquidaciones) → BullMQ sobre Redis cuando exista un
  trabajo real; el perfil `redis` de Compose está listo para eso.

# Variables de entorno

`pnpm env:init` copia cada plantilla de abajo a su destino (ignorado por git). Nunca sobrescribe.

> **Públicas y secretas.** Las variables con prefijo `NEXT_PUBLIC_` (web) o `EXPO_PUBLIC_` (móvil)
> se compilan dentro del código que corre en los dispositivos de los usuarios. Cualquiera puede
> leerlas. **Nunca pongas un secreto en ellas.** Las apps móviles no tienen un lugar seguro para
> secretos de API; todo lo que va dentro de la app es público. Los secretos del servidor van solo
> en el entorno de la API.

## `.env` de la raíz — Docker Compose (solo desarrollo local)

Plantilla: `.env.example`

| Variable            | Obligatoria | Secreta | Por defecto      | Para qué                                                                        |
| ------------------- | ----------- | ------- | ---------------- | ------------------------------------------------------------------------------- |
| `POSTGRES_DB`       | sí          | no      | `vtp_dev`        | Base de datos creada en el primer arranque                                      |
| `POSTGRES_USER`     | sí          | no      | `vtp`            | Superusuario creado en el primer arranque                                       |
| `POSTGRES_PASSWORD` | sí          | **sí**  | valor de ejemplo | Contraseña del superusuario. Solo se aplica al crear el volumen por primera vez |
| `POSTGRES_PORT`     | no          | no      | `5432`           | Puerto del host, enlazado a `127.0.0.1`                                         |
| `REDIS_PORT`        | no          | no      | `6379`           | Puerto del host para el Redis opcional, enlazado a `127.0.0.1`                  |

Solo para la API y la web en Docker (`pnpm stack:api`, `pnpm stack:app`, ver [docker.md](docker.md)):

| Variable                                | Obligatoria | Secreta | Por defecto                    | Para qué                                                                                   |
| --------------------------------------- | ----------- | ------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `VTP_API_PORT`                          | no          | no      | `4000`                         | Puerto del host para el contenedor de la API                                               |
| `VTP_API_PUBLISH_ADDRESS`               | no          | no      | `127.0.0.1`                    | `0.0.0.0` permite que los teléfonos de tu Wi-Fi lleguen a la API (solo redes de confianza) |
| `VTP_WEB_PORT`                          | no          | no      | `3000`                         | Puerto del host para el contenedor de la web                                               |
| `VTP_WEB_PUBLIC_API_BASE_URL`           | no          | no      | `http://localhost:4000/api/v1` | URL de la API que usa el navegador; queda dentro de la imagen de la web al compilarla      |
| `VTP_AUTH_SECRET`                       | no          | **sí**  | valor de ejemplo local         | Secreto de sesión de la API dentro de Docker; producción rechaza el valor de ejemplo       |
| `VTP_MAIL_DELIVERY`                     | no          | no      | `console`                      | `smtp` envía los correos de la API en Docker a Mailpit (`pnpm infra:up:mail`)              |
| `MAILPIT_SMTP_PORT`, `MAILPIT_WEB_PORT` | no          | no      | `1025`, `8025`                 | Puertos del host para Mailpit                                                              |

## `apps/api/.env` — API

Plantilla: `apps/api/.env.example`. La valida `apps/api/src/config/env.schema.ts`; la API no
arranca y lista los **nombres** de las variables inválidas (nunca sus valores).

| Variable                        | Obligatoria | Secreta                              | Por defecto                 | Para qué                                                                                                                                                                                                                                         |
| ------------------------------- | ----------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                      | no          | no                                   | `development`               | `development` \| `test` \| `production`. En producción se ignoran los archivos `.env`                                                                                                                                                            |
| `APP_VERSION`                   | no          | no                                   | `0.0.0-dev`                 | La informa `/api/v1/health`. Pon la etiqueta de la versión o el sha de git                                                                                                                                                                       |
| `API_HOST`                      | no          | no                                   | `127.0.0.1`                 | Dirección en la que escucha. `0.0.0.0` para dispositivos físicos en la red local o dentro de contenedores                                                                                                                                        |
| `API_PORT`                      | no          | no                                   | `4000`                      | Puerto HTTP                                                                                                                                                                                                                                      |
| `CORS_ORIGINS`                  | no          | no                                   | vacío                       | Orígenes de navegador permitidos, separados por comas (portal web; `:8081`/`:8082` para las vistas previas móviles en desarrollo). Vacío = ninguno. `*` se rechaza en producción                                                                 |
| `API_TRUST_PROXY_HOPS`          | no          | no                                   | `0`                         | Saltos de proxy inverso de confianza para `X-Forwarded-For`. `1` detrás de un solo Caddy/Nginx; nunca más que los proxies reales                                                                                                                 |
| `RATE_LIMIT_TTL_SECONDS`        | no          | no                                   | `60`                        | Ventana del límite de solicitudes                                                                                                                                                                                                                |
| `RATE_LIMIT_MAX`                | no          | no                                   | `120`                       | Máximo de solicitudes por IP de cliente en cada ventana (los endpoints de salud quedan exentos)                                                                                                                                                  |
| `LOG_LEVEL`                     | no          | no                                   | `info`                      | `fatal`…`trace`, o `silent`                                                                                                                                                                                                                      |
| `SWAGGER_ENABLED`               | no          | no                                   | activo, salvo en producción | Servir `/api/docs`                                                                                                                                                                                                                               |
| `DATABASE_HOST`                 | sí          | no                                   | —                           | Host de PostgreSQL                                                                                                                                                                                                                               |
| `DATABASE_PORT`                 | no          | no                                   | `5432`                      | Puerto de PostgreSQL                                                                                                                                                                                                                             |
| `DATABASE_NAME`                 | sí          | no                                   | —                           | Nombre de la base de datos (igual a `POSTGRES_DB` en local)                                                                                                                                                                                      |
| `DATABASE_USER`                 | sí          | no                                   | —                           | Usuario de la base de datos (igual a `POSTGRES_USER` en local)                                                                                                                                                                                   |
| `DATABASE_PASSWORD`             | sí          | **sí**                               | —                           | En producción: 16 caracteres o más y sin `change-me`                                                                                                                                                                                             |
| `DATABASE_SSL`                  | no          | no                                   | `false`                     | `true` para exigir TLS con verificación del certificado                                                                                                                                                                                          |
| `DATABASE_POOL_MAX`             | no          | no                                   | `10`                        | Máximo de conexiones del pool (1–100)                                                                                                                                                                                                            |
| `AUTH_SECRET`                   | sí          | **sí**                               | —                           | Clave HMAC para los hashes de los tokens de sesión y de los códigos, 32 caracteres o más. Cambiarla cierra la sesión de todos. Producción rechaza valores con `change-me`                                                                        |
| `AUTH_ACCESS_TOKEN_TTL_MINUTES` | no          | no                                   | `15`                        | Duración del token de acceso (1–60)                                                                                                                                                                                                              |
| `AUTH_REFRESH_TOKEN_TTL_DAYS`   | no          | no                                   | `30`                        | Duración del token de renovación / de la sesión (1–90)                                                                                                                                                                                           |
| `AUTH_RATE_LIMIT_MAX`           | no          | no                                   | `10`                        | Solicitudes por minuto por IP a los endpoints de inicio de sesión, registro, renovación y códigos                                                                                                                                                |
| `OTP_DELIVERY`                  | no          | no                                   | `console`                   | `console` imprime los códigos en el log (solo desarrollo; se rechaza en producción), `email` los envía por correo con el mailer (los de SMS/WhatsApp responden 503) o `disabled` (503)                                                           |
| `OTP_TTL_MINUTES`               | no          | no                                   | `5`                         | Validez del código (1–30)                                                                                                                                                                                                                        |
| `OTP_MAX_ATTEMPTS`              | no          | no                                   | `5`                         | Intentos fallidos permitidos por código                                                                                                                                                                                                          |
| `OTP_RESEND_SECONDS`            | no          | no                                   | `60`                        | Espera mínima entre códigos al mismo destino                                                                                                                                                                                                     |
| `OTP_MAX_PER_HOUR`              | no          | no                                   | `5`                         | Códigos por destino por hora (limita el abuso del costo de SMS)                                                                                                                                                                                  |
| `FILE_STORAGE_DRIVER`           | no          | no                                   | `local`                     | Dónde se guardan los documentos KYC. Hoy solo existe `local` (compatible con S3, planificado)                                                                                                                                                    |
| `FILE_STORAGE_LOCAL_DIR`        | no          | no                                   | `var/uploads`               | Carpeta del driver local (relativa a la carpeta de trabajo de la API). En producción monta un volumen persistente y respaldado                                                                                                                   |
| `FILE_UPLOAD_MAX_BYTES`         | no          | no                                   | `10485760`                  | Tamaño máximo de carga (10 MiB); las cargas más grandes reciben `413 PAYLOAD_TOO_LARGE`                                                                                                                                                          |
| `BOOKING_HOLD_MINUTES`          | no          | no                                   | `15`                        | Minutos que los puestos apartados esperan el pago antes de liberarse (5–60)                                                                                                                                                                      |
| `PAYMENT_PROVIDER`              | no          | no                                   | ver descripción             | `simulated` (solo desarrollo, se rechaza en producción), `manual` (cuentas de la plataforma, verificación a mano) o `disabled`. Por defecto: simulated fuera de producción, manual en producción. Ver [payments.md](../architecture/payments.md) |
| `MAIL_DELIVERY`                 | no          | no                                   | ver descripción             | `console` (solo desarrollo), `smtp` o `disabled`. Por defecto: console fuera de producción, disabled en producción. Ver [notifications.md](../architecture/notifications.md)                                                                     |
| `SMTP_HOST`                     | con `smtp`  | no                                   | vacío                       | Servidor SMTP (en desarrollo, `localhost` con Mailpit)                                                                                                                                                                                           |
| `SMTP_PORT`                     | no          | no                                   | `587`                       | Puerto SMTP (Mailpit: `1025`)                                                                                                                                                                                                                    |
| `SMTP_SECURE`                   | no          | no                                   | `false`                     | `true` para TLS directo (puerto 465); con `false` usa STARTTLS si el servidor lo ofrece                                                                                                                                                          |
| `SMTP_USER`                     | no          | no                                   | vacío                       | Usuario SMTP                                                                                                                                                                                                                                     |
| `SMTP_PASSWORD`                 | no          | **sí**                               | vacío                       | Contraseña SMTP. Solo en el servidor                                                                                                                                                                                                             |
| `MAIL_FROM`                     | no          | no                                   | `VTP <no-reply@localhost>`  | Remitente de los correos; en producción, un dominio propio con SPF y DKIM                                                                                                                                                                        |
| `PUSH_DELIVERY`                 | no          | no                                   | ver descripción             | `console` (solo desarrollo), `expo` (servicio de push de Expo) o `disabled`. Por defecto: console fuera de producción, disabled en producción                                                                                                    |
| `EXPO_ACCESS_TOKEN`             | no          | **sí**                               | vacío                       | Solo si el proyecto de Expo tiene activada la "seguridad de push mejorada"                                                                                                                                                                       |
| `TRIP_REMINDER_HOURS`           | no          | no                                   | `3`                         | Horas antes de abordar en que se avisa al pasajero (0 apaga los recordatorios)                                                                                                                                                                   |
| `REDIS_URL`                     | no          | **sí** (puede llevar una contraseña) | vacío                       | URL `redis://` o `rediss://`. Sin uso hasta que una funcionalidad necesite Redis                                                                                                                                                                 |
| `E2E_EXPECT_DATABASE`           | no          | no                                   | —                           | Solo pruebas: `true` hace que las pruebas e2e exijan que la base de datos esté lista                                                                                                                                                             |

## `apps/web/.env.local` — web (Next.js)

Plantilla: `apps/web/.env.example`. Se valida en `apps/web/src/lib/env.ts`; la compilación falla si
es inválida.

| Variable                   | Obligatoria | Secreta          | Por defecto                    | Para qué                                                                                                                                                                                           |
| -------------------------- | ----------- | ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | sí          | **no — pública** | `http://localhost:4000/api/v1` | URL base de la API que usa el navegador. Se inserta al **compilar**; cambiarla requiere recompilar                                                                                                 |
| `API_INTERNAL_BASE_URL`    | no          | no               | —                              | Solo en el servidor. URL de la API que usa el servidor web (Server Actions, proxy); en Docker, la dirección privada, por ejemplo `http://api:4000/api/v1`. Por defecto, `NEXT_PUBLIC_API_BASE_URL` |

Las variables de la web que son solo del servidor **no** deben usar el prefijo `NEXT_PUBLIC_`.

## `apps/passenger-mobile/.env` y `apps/transport-mobile/.env` — móvil (Expo)

Plantillas: `apps/*-mobile/.env.example`. Se validan en `src/config/env.ts`.

| Variable                   | Obligatoria | Secreta          | Por defecto                    | Para qué                                       |
| -------------------------- | ----------- | ---------------- | ------------------------------ | ---------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL` | sí          | **no — pública** | `http://localhost:4000/api/v1` | URL base de la API incluida en el bundle de JS |

Valores según el destino:

| Destino                      | Valor                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Simulador de iOS (macOS)     | `http://localhost:4000/api/v1`                                                      |
| Emulador de Android          | `http://10.0.2.2:4000/api/v1`                                                       |
| Dispositivo físico (Expo Go) | `http://<IP-de-la-computadora>:4000/api/v1` y `API_HOST=0.0.0.0` en `apps/api/.env` |

Reinicia Metro con `--clear` después de cambiar estos valores.

## CI

CircleCI y el runner propio definen en su configuración (`.circleci/config.yml`,
`.github/workflows/self-hosted-ci.yml`) URLs públicas de ejemplo y credenciales de base de datos
desechables. No son secretos. Los secretos reales de despliegue irán en los **contexts** de
CircleCI o en los secretos de entorno de GitHub (restringidos al trabajo de despliegue), nunca en
los archivos de configuración.

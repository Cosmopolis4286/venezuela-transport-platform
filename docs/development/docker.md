# Correr la plataforma con Docker

`docker-compose.yml` (raíz del repositorio) corre la plataforma en tu computadora de tres formas.
Elige según en qué estés trabajando:

| Modo                    | En Docker                 | En tu computadora            | Iniciar                                   |
| ----------------------- | ------------------------- | ---------------------------- | ----------------------------------------- |
| **Local** (por defecto) | Base de datos             | API, web y apps móviles      | `pnpm infra:up` y luego `pnpm dev`        |
| **Híbrido** (frontends) | Base de datos + API       | Web y/o apps móviles         | `pnpm stack:api` y luego `pnpm dev:web` … |
| **Todo en Docker**      | Base de datos + API + web | Solo las apps móviles (Expo) | `pnpm stack:app`                          |

- **Local** es el flujo habitual para trabajar en el backend: la API se recarga al editar
  ([local-setup.md](local-setup.md)).
- **Híbrido** es para trabajar en los frontends: no necesitas las herramientas de la API ni correr
  migraciones, y la web y las apps se recargan mientras editas.
- **Todo en Docker** usa **las mismas imágenes que producción**, con ajustes de desarrollo. Sirve
  para probar la plataforma completa o comprobar que las imágenes funcionan.

Las apps móviles nunca corren en Docker: corren en un teléfono, un emulador o la vista previa en
el navegador ([android-testing.md](android-testing.md)).

## Comandos

| Tarea                                                | Comando                                |
| ---------------------------------------------------- | -------------------------------------- |
| Solo la base de datos                                | `pnpm infra:up`                        |
| Base de datos + API (construye la imagen de la API)  | `pnpm stack:api`                       |
| Base de datos + API + web (construye ambas imágenes) | `pnpm stack:app`                       |
| Estado                                               | `pnpm infra:ps`                        |
| Logs de la API y la web                              | `pnpm stack:logs`                      |
| Detener todo (los datos se conservan)                | `pnpm stack:down`                      |
| **Borrar** los datos locales                         | `pnpm infra:reset` (pide confirmación) |

`pnpm stack:*` reconstruye las imágenes cuando el código cambió; la primera vez tarda unos
minutos. Las migraciones se aplican solas (servicio `migrate`) antes de que arranque la API.

| URL                            | Qué          |
| ------------------------------ | ------------ |
| http://localhost:3000          | Web y portal |
| http://localhost:4000/api/v1   | API          |
| http://localhost:4000/api/docs | Swagger UI   |

## Ajustes de desarrollo dentro de Docker

El contenedor de la API usa la imagen de producción con `NODE_ENV=development`, así que:

- **Los códigos de acceso** se imprimen en su log: `docker compose logs api | grep "login code"`
  (o entra con correo + contraseña).
- **Los pagos** usan el proveedor simulado (las apps ofrecen "Simular pago").
- Los documentos KYC subidos se guardan en el volumen `api-uploads`.
- Los logs salen en JSON (el formateador bonito es una dependencia de desarrollo y no está en la
  imagen).
- Para darte permisos de personal de la plataforma:
  `docker compose exec api node dist/cli/platform-grant.js --email tu@ejemplo.com --role admin`
  — o ejecuta `pnpm platform:grant …` desde tu computadora contra la misma base de datos.

El contenedor de la web es la versión de producción: el navegador llama a la API en
`VTP_WEB_PUBLIC_API_BASE_URL` (por defecto `http://localhost:4000/api/v1`) y el servidor la llama
por la red interna de Compose. Sus cookies de sesión son `Secure`, y los navegadores las aceptan en
`http://localhost`; ábrela como `localhost`, no por IP.

## Modo híbrido paso a paso

```bash
pnpm stack:api                  # base de datos + API en Docker, migraciones aplicadas
pnpm dev:web                    # web en http://localhost:3000 (se recarga al editar)
pnpm dev:passenger              # y/o la app de pasajeros (Metro en :8081)
pnpm dev:transport              # y/o la app de transportistas (Metro en :8082)
```

**No** corras `pnpm dev` ni `pnpm dev:api` al mismo tiempo: arrancan una segunda API en el puerto 4000. `apps/web/.env.local` se queda con su valor por defecto
`NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`.

## Configuración

El `.env` de la raíz (lo crea `pnpm env:init`) alimenta tanto la base de datos como los
contenedores. Las variables `VTP_*` son opcionales
([environment-variables.md](environment-variables.md)): los puertos, la dirección en la que se
publica la API y la URL de la API que queda dentro de la imagen de la web (reconstruye con
`pnpm stack:app` después de cambiarla). Los contenedores **no** usan `apps/api/.env`.

## Problemas frecuentes

| Síntoma                                               | Solución                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `port is already allocated` (4000 o 3000)             | Hay un `pnpm dev` local corriendo: detenlo, o define `VTP_API_PORT` / `VTP_WEB_PORT` en `.env`.                    |
| `migrate` termina con error                           | `docker compose logs migrate`. La contraseña de `.env` debe ser la misma con la que se creó el volumen.            |
| La web carga pero al iniciar sesión vuelve a `/login` | Ábrela como `http://localhost:3000`, no con `127.0.0.1` ni la IP de la red (cookies seguras).                      |
| Un teléfono no llega a la API                         | Define `VTP_API_PUBLISH_ADDRESS=0.0.0.0`, corre de nuevo `pnpm stack:api` y permite el puerto 4000 en el firewall. |
| Las imágenes no toman tus cambios                     | `pnpm stack:app` reconstruye; para forzarlo: `docker compose --profile app build --no-cache`.                      |

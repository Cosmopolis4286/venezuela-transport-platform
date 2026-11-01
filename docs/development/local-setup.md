# Instalación local

Probado en Linux (Ubuntu 24.04, Node 24.22.0, pnpm 10.34.7, Docker 29.8 / Compose 5.6). Los pasos
de macOS y Windows siguen los instaladores oficiales; no se corren en la CI.

## 1. Instalar las herramientas

### macOS

```bash
# Node con un gestor de versiones (lee .nvmrc)
brew install fnm && fnm install 24 && fnm use 24
corepack enable
# Docker Desktop (u OrbStack / Colima)
brew install --cask docker
# Simulador de iOS: instala Xcode desde la App Store y luego
xcode-select --install
```

### Linux (Ubuntu/Debian)

```bash
curl -fsSL https://fnm.vercel.app/install | bash   # o nvm
fnm install 24 && fnm use 24
corepack enable
# Docker Engine + plugin de Compose: https://docs.docker.com/engine/install/ubuntu/
sudo usermod -aG docker "$USER"   # cierra sesión y vuelve a entrar después
```

### Windows

Usa **WSL 2 (Ubuntu)** para el repositorio y todos los comandos; evita problemas de rutas, finales
de línea y detección de cambios en Metro y Next.js.

1. `wsl --install -d Ubuntu` (PowerShell como administrador) y reinicia.
2. Instala **Docker Desktop** con el backend de WSL 2 y activa la integración con Ubuntu.
3. Dentro de Ubuntu, sigue los pasos de Linux de arriba. Clona el repositorio en el sistema de
   archivos de Linux (`~/code/...`), **no** en `/mnt/c/`.
4. El emulador de Android corre en Windows (Android Studio). Ver _Apps móviles_ más abajo para la
   red.

`.gitattributes` fuerza finales de línea LF, así que la configuración de Git en Windows no
importa.

## 2. Clonar, instalar y configurar

```bash
git clone https://github.com/Cosmopolis4286/venezuela-transport-platform.git
cd venezuela-transport-platform
corepack enable
pnpm install          # usa pnpm-lock.yaml; falla con versiones incorrectas de Node/pnpm (engine-strict)
pnpm env:init         # crea .env, apps/api/.env, apps/web/.env.local, apps/*-mobile/.env
```

Los archivos generados tienen valores de ejemplo que funcionan juntos sin tocar nada. Si cambias
la contraseña de la base de datos, cámbiala en **los dos**: `.env` (`POSTGRES_PASSWORD`) y
`apps/api/.env` (`DATABASE_PASSWORD`). Ver [environment-variables.md](environment-variables.md).

## 3. Base de datos

```bash
pnpm infra:up         # arranca postgis/postgis:18-3.6 y espera el chequeo de salud
pnpm db:check         # OK: PostgreSQL 18.x, PostGIS 3.6.x at 127.0.0.1:5432/vtp_dev
pnpm db:migrate       # aplica apps/api/drizzle/*.sql
pnpm db:psql          # psql interactivo dentro del contenedor
```

**Inicialización.** En el _primer_ arranque con el volumen vacío, la imagen crea la base de datos
y el usuario con los datos de `.env` y ejecuta `infrastructure/docker/postgres/init/*.sql`, que
activa `postgis`, `pgcrypto`, `citext` y `pg_trgm`. Los arranques siguientes reutilizan el volumen
y se saltan la inicialización. Las tablas vienen de las migraciones — aplícalas después de que
arranque la base de datos:

```bash
pnpm db:migrate       # idempotente; se puede correr en cualquier momento
```

Ver las [decisiones](../architecture/decisions.md#adr-007-drizzle-orm-con-migraciones-sql-versionadas)
para generar migraciones nuevas.

**Duración de los datos.** Los datos viven en el volumen `vtp_postgres-data`. `pnpm infra:down`
los conserva. `pnpm infra:reset` **los borra para siempre** (te pide escribir `vtp`). Si hace
falta, haz antes una copia:

```bash
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > backup.dump
# restaurar en una base de datos nueva:
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backup.dump
```

Los puertos están enlazados a `127.0.0.1`, así que no se puede llegar a la base de datos desde
otras máquinas.

Redis opcional: `pnpm infra:up:redis` (agrega `redis:8.10-alpine` en `127.0.0.1:6379`).

Correo opcional: `pnpm infra:up:mail` arranca [Mailpit](https://mailpit.axllent.org/), que recibe
los correos sin enviarlos a nadie. Ponlo en `apps/api/.env` con `MAIL_DELIVERY=smtp`,
`SMTP_HOST=localhost`, `SMTP_PORT=1025` (y `OTP_DELIVERY=email` para recibir los códigos por
correo) y lee los mensajes en http://localhost:8025. Sin Mailpit, los correos y las
notificaciones push se escriben en el log de la API.

## 4. Correr las apps

```bash
pnpm dev              # web http://localhost:3000 + API http://localhost:4000/api/v1
pnpm dev:api          # solo la API (se recarga al editar) — Swagger en http://localhost:4000/api/docs
pnpm dev:web          # solo la web
pnpm dev:passenger    # Metro para la app de pasajeros en :8081
pnpm dev:transport    # Metro para la app de transportistas en :8082
pnpm dev:all          # todo lo anterior en una sola interfaz de Turborepo
```

La API arranca aunque la base de datos esté caída; en ese caso `/api/v1/health/ready` devuelve 503.

En desarrollo, los códigos de acceso de un solo uso **se imprimen en la consola de la API**
(`OTP_DELIVERY=console`); busca `[DEV ONLY] login code for +58 *** ***4567 via sms: 123456`.
Todavía no hay ningún proveedor de SMS, WhatsApp ni correo integrado.

Para correr la API (y la web) en Docker, ver [docker.md](docker.md).

## Apps móviles

Probar paso a paso en un teléfono, un emulador o como APK:
[android-testing.md](android-testing.md).

Docker **no** se usa para el desarrollo móvil. Cada app corre su propio Metro; ábrela con una de
estas opciones:

| Destino             | Cómo                                                                        | Requisitos                                  |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| Teléfono físico     | Instala **Expo Go** y escanea el código QR que muestra `pnpm dev:passenger` | La misma red Wi-Fi que la computadora       |
| Emulador de Android | Pulsa `a` en la terminal de Metro                                           | Android Studio + un AVD (cualquier sistema) |
| Simulador de iOS    | Pulsa `i` en la terminal de Metro                                           | **Solo macOS con Xcode**                    |

**Llegar a la API desde un dispositivo.** Dentro de un teléfono o emulador, `localhost` es el
propio dispositivo. Define `EXPO_PUBLIC_API_BASE_URL` en el `.env` de la app:

- Emulador de Android → `http://10.0.2.2:4000/api/v1`
- Dispositivo físico → `http://<tu-IP-de-red>:4000/api/v1`, y pon `API_HOST=0.0.0.0` en
  `apps/api/.env` para que la API escuche en la red (solo en redes de confianza).
- WSL 2 + dispositivo físico → usa `npx expo start --tunnel` para Metro y expón la API con la IP
  de Windows y un reenvío de puertos, o activa el modo de red "mirrored" de WSL.

Luego reinicia Metro limpiando la caché:
`pnpm --filter @vtp/passenger-mobile exec expo start --clear --port 8081`.

**Vista previa en el navegador.** `pnpm --filter @vtp/transport-mobile dev --web` (o
`passenger-mobile`) abre la app en un navegador en http://localhost:8082 (8081), útil para revisar
pantallas sin emulador. Ahí la sesión vive en memoria, así que recargar la página la cierra
([detalles](../architecture/mobile-apps.md#vista-previa-en-el-navegador)). Si creaste
`apps/api/.env` antes de que existiera esto, agrega `http://localhost:8081,http://localhost:8082` a
su `CORS_ORIGINS`.

**Limitaciones.**

- Expo Go solo trae los módulos nativos incluidos por Expo. Agregar una biblioteca con código
  nativo propio requiere una development build (`npx expo run:android|ios` o EAS Build).
- Las versiones para las tiendas y su firma necesitan cuentas de Apple/Google y credenciales de
  EAS; no hay ninguna configurada. La CI solo produce bundles de JS (`expo export`), que no
  necesitan credenciales.
- `pnpm --filter @vtp/passenger-mobile doctor` ejecuta `expo-doctor`, que necesita acceso a
  internet a la API de Expo.

## Administrador de la plataforma (la primera vez)

Regístrate una vez (por ejemplo, con un código a tu teléfono) y luego date el rol de
administrador desde la raíz del repositorio:

```bash
pnpm platform:grant --phone 0414-1234567 --role admin
```

Los administradores y revisores aprueban las organizaciones recién registradas. Ver
[organizations.md](../architecture/organizations.md).

## 5. Verificar todo

```bash
pnpm check                              # lint + tipos + pruebas unitarias
pnpm build                              # compilación de producción de la web y la API
E2E_EXPECT_DATABASE=true pnpm test:e2e  # pruebas e2e de la API contra la base de datos local
pnpm turbo run export                   # bundles de Metro de las dos apps móviles
curl -s localhost:4000/api/v1/health    # {"status":"ok",...} mientras corre pnpm dev:api
```

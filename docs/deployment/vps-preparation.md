# Preparación del despliegue en un VPS

> **No hay nada desplegado.** Este es el plan y la lista de verificación para un primer despliegue
> de la API y la web en un VPS Linux. Los archivos de referencia para producción están en
> `infrastructure/docker/production/`: `api.Dockerfile`, `web.Dockerfile`, `compose.yml` (Caddy +
> API + web + PostGIS + `migrate` de una sola vez), `Caddyfile` y `env.example`. La CI construye
> las dos imágenes en cada PR pero **no las publica en ningún lado**. No reutilices el
> `docker-compose.yml` de desarrollo.

## Topología objetivo (un solo VPS, bajo costo)

```
Internet ──443──▶ Caddy (o Nginx + certbot)  ── TLS, HTTP→HTTPS, cabeceras de seguridad
                      ├── app.example.ve  ──▶ web  (Next.js, `next start`, 127.0.0.1:3000)
                      └── api.example.ve  ──▶ api  (NestJS, 127.0.0.1:4000)
                                                 └──▶ PostgreSQL 18 + PostGIS (solo localhost / red de Docker)
```

Para empezar basta un VPS de 2 vCPU / 4 GB de RAM (Ubuntu 24.04 LTS). Un PostgreSQL administrado
es una alternativa válida si incluye copias de seguridad y PostGIS.

## 1. Base del servidor

- [ ] Crea un usuario con sudo que no sea root; desactiva el inicio de sesión SSH con contraseña y
      como root (`PermitRootLogin no`, `PasswordAuthentication no`); usa solo llaves SSH.
- [ ] `ufw default deny incoming`; permite solo `22/tcp` (o un puerto SSH propio), `80/tcp` y
      `443/tcp`.
- [ ] `unattended-upgrades` para los parches de seguridad; `fail2ban` para SSH.
- [ ] Instala Docker Engine + el plugin de Compose. Nunca publiques el puerto de la base de datos
      a internet; la publicación de puertos de Docker se salta `ufw`, así que enlaza a
      `127.0.0.1` o usa una red interna.
- [ ] Pon la zona horaria del servidor en UTC (se guarda `timestamptz`; se muestra en
      `America/Caracas`).

## 2. HTTPS y proxy inverso

- [ ] Registros DNS A/AAAA para los dominios de la web y la API.
- [ ] Caddy obtiene y renueva los certificados de Let's Encrypt automáticamente (o Nginx +
      certbot).
- [ ] Reenvía `X-Forwarded-For`/`X-Forwarded-Proto` y define `API_TRUST_PROXY_HOPS=1` para que el
      límite de solicitudes vea las IPs reales de los clientes (si no, todas las solicitudes
      parecen venir del proxy).
- [ ] Agrega HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y una CSP para la web.
- [ ] Limita el tamaño del cuerpo de las solicitudes (por ejemplo 1 MB, más para los documentos
      KYC) y activa gzip/zstd en el proxy.

## 3. Secretos y configuración

- [ ] Las variables de producción se entregan como variables de entorno reales (`env_file:` de
      Compose con un archivo de root con `chmod 600` fuera del repositorio, o secretos de GitHub
      Environments inyectados por el trabajo de despliegue). La API ignora los archivos `.env`
      cuando `NODE_ENV=production`.
- [ ] `NODE_ENV=production`, `API_HOST=0.0.0.0` (dentro del contenedor), `CORS_ORIGINS` explícito
      (`https://app.example.ve`), `SWAGGER_ENABLED=false` salvo que sea público a propósito,
      `APP_VERSION=<sha de git>`.
- [ ] `DATABASE_PASSWORD` única y fuerte (la API rechaza en producción las débiles o de ejemplo).
      Usa un rol de la aplicación con los mínimos privilegios, separado del rol dueño que corre las
      migraciones.
- [ ] `OTP_DELIVERY=disabled` y `PAYMENT_PROVIDER=disabled` hasta integrar proveedores reales (la
      API rechaza `console` y `simulated` en producción).
- [ ] `NEXT_PUBLIC_API_BASE_URL` se define al **compilar** la imagen de la web.
- [ ] Rota cualquier secreto que alguna vez se haya pegado en un chat, un ticket o un log.

## 4. Compilación y publicación

Las imágenes se construyen desde la raíz del repositorio:

```bash
docker build -f infrastructure/docker/production/api.Dockerfile -t vtp-api:$(git rev-parse --short HEAD) .
docker build -f infrastructure/docker/production/web.Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.ve/api/v1 \
  -t vtp-web:$(git rev-parse --short HEAD) .
```

- Imagen de la API: solo la salida de `pnpm deploy --prod` (sin dependencias de desarrollo ni
  código fuente), corre como `node`, `HEALTHCHECK` sobre `/api/v1/health`, las migraciones van en
  `drizzle/`.
- Imagen de la web: la salida `standalone` de Next.js (activada con `NEXT_OUTPUT=standalone` solo
  en el Dockerfile), corre como `node`. `NEXT_PUBLIC_API_BASE_URL` queda fijo al compilar, así que
  se construye una imagen por entorno.
- Detrás de un proxy que intercepta TLS, pasa su CA como secreto de compilación:
  `--secret id=ca_bundle,src=/ruta/a/ca.crt` (nunca se copia en una capa).
- [ ] Publica en un registro (GitHub Container Registry es gratis para repositorios privados
      dentro de ciertos límites), con el sha de git como etiqueta. Requiere un workflow de
      despliegue y credenciales del registro — todavía no está configurado.
- [ ] Desplegar = `pull` → `run --rm migrate` → `up -d` → comprobar
      `https://<api>/api/v1/health/ready` (los comandos están al inicio de `compose.yml`).

## 5. Migraciones de la base de datos

- [ ] Las migraciones corren como un **paso separado de una sola vez** antes de arrancar la nueva
      versión de la API (`docker compose run --rm migrate`), nunca automáticamente al arrancar la
      API.
- [ ] Solo migraciones compatibles hacia atrás (expandir → desplegar → contraer), para que la
      versión anterior de la API siga funcionando durante y después de la migración, lo que
      mantiene posible la vuelta atrás.

## 6. Copias de seguridad

- [ ] `pg_dump -Fc` cada noche a otro proveedor o bucket (cifrado, por ejemplo con `age`), con
      retención de 7 diarias + 4 semanales + 6 mensuales. Considera archivar el WAL
      (pgBackRest/WAL-G) cuando la tolerancia a la pérdida de datos baje de 24 h.
- [ ] **Prueba de restauración** mensual en una base de datos temporal; una copia que nunca se
      restauró no es una copia.
- [ ] Respalda el volumen `api-uploads` (documentos KYC) con el mismo horario y cifrado que la
      base de datos — los dos deben poder restaurarse juntos.
- [ ] Respalda también la configuración del proxy inverso y el archivo de entorno de producción
      (cifrados).

## 7. Chequeos de salud y monitoreo

- [ ] Chequeo de salud del contenedor u orquestador sobre `GET /api/v1/health`; el balanceador o
      la puerta del despliegue sobre `GET /api/v1/health/ready` (503 mientras no se llega a la base
      de datos).
- [ ] Monitoreo de disponibilidad gratuito (por ejemplo Uptime Kuma en el propio servidor, o un
      servicio externo gratuito) sobre ambos endpoints y la página de inicio de la web.
- [ ] Los logs salen en JSON por stdout; rótalos con el driver de logs `local` de Docker
      (`max-size`, `max-file`). Los logs no deben contener secretos ni datos personales de
      pasajeros (la API oculta las cabeceras de autenticación y por defecto omite query strings y
      cuerpos).

## 8. Volver atrás

- [ ] Conserva las etiquetas de las imágenes anteriores. Volver atrás = redesplegar el sha
      anterior; no hace falta recompilar.
- [ ] Como las migraciones son compatibles hacia atrás, la versión anterior funciona con el
      esquema nuevo. Si hay que deshacer una migración, restaurar desde la copia de seguridad es
      el último recurso — documenta la decisión en las notas del incidente.
- [ ] Anota el comando exacto para volver atrás junto al comando de despliegue, y practícalo una
      vez antes del primer lanzamiento real.

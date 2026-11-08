# Operación de producción

Estos archivos son para un VPS Linux y **no** sustituyen el Compose local de la raíz.

## Archivos

- `compose.yml`: Caddy, Next.js, NestJS, PostgreSQL/PostGIS y migración separada.
- `api.Dockerfile` y `web.Dockerfile`: imágenes multi-stage, proceso sin root.
- `Caddyfile`: HTTPS automático, proxy, cabeceras de seguridad y límite de carga (11 MB en la API, para los documentos KYC).
- `postgres/init-app-role.sh`: crea el rol de runtime con privilegios DML limitados y privilegios por defecto para tablas futuras.
- `env.example`: plantillas para archivos externos.
- `deploy.sh`: valida, descarga imágenes, ejecuta migraciones y despliega.
- Copias de seguridad: `infrastructure/backup/` (ver [copias de seguridad](../../../docs/deployment/backups.md)).

## Preparar el VPS

1. Instala Docker Engine + Compose v2 y `curl`, `age`.
2. Crea `/etc/vtp` y copia cada bloque de `env.example` en:
   - `/etc/vtp/compose.env`
   - `/etc/vtp/postgres.env`
   - `/etc/vtp/migrate.env`
   - `/etc/vtp/api.env`
3. Genera secretos únicos: `openssl rand -hex 32` para `AUTH_SECRET` y
   `openssl rand -base64 36` para cada contraseña. Usa la misma contraseña de owner en
   `postgres.env` y `migrate.env`; la de app debe ser distinta.
4. Protege los archivos: `chown root:root /etc/vtp/*.env && chmod 600 /etc/vtp/*.env`.
5. Configura DNS A/AAAA para ambos dominios hacia el VPS y abre solo SSH, TCP 80 y TCP 443.
6. Asegura que GHCR sea accesible desde el servidor. Para paquetes privados, inicia sesión con un
   token de solo lectura de paquetes.

**Importante:** el script `postgres/init-app-role.sh` solo se ejecuta cuando PostgreSQL inicializa
un volumen vacío. En una base ya existente, crea el rol y sus grants manualmente o mediante una
migración operativa antes de cambiar la API a `vtp_app`.

## Publicar imágenes

El workflow `.github/workflows/publish-images.yml` publica imágenes inmutables en GHCR (gratis
para repositorios públicos) solo después de que el workflow **CI** de `main` termina
correctamente. Usa el SHA completo del commit como etiqueta. Mientras no exista la variable de
Actions `VTP_API_DOMAIN` (hostname de la API, sin protocolo ni ruta; Settings → Secrets and
variables → Actions → Variables) el trabajo se omite: la imagen web lleva esa URL dentro.

Actualiza `VTP_API_IMAGE` y `VTP_WEB_IMAGE` en `/etc/vtp/compose.env` para apuntar al mismo SHA.
Luego, desde el checkout de producción:

```bash
sudo bash infrastructure/docker/production/deploy.sh
```

El script ejecuta migraciones antes de actualizar servicios y comprueba la API y la web por HTTPS.

## Copias de seguridad y restauración

Ver [docs/deployment/backups.md](../../../docs/deployment/backups.md): `infrastructure/backup/backup.sh`
cada noche (base de datos y documentos KYC cifrados con age, retención 7/4/6, copia opcional a otro
proveedor) y `restore-check.sh` para ensayar la restauración cada mes. Las copias usan el rol
propietario (`POSTGRES_USER`).

## Limitaciones antes de abrir al público

- No existe integración de pagos automáticos: `PAYMENT_PROVIDER=manual` requiere cuentas
  verificadas y revisión humana. Nunca habilites el proveedor simulado en producción.
- Mantén una sola instancia de API mientras el rate limiter use memoria local.
- Configura SMTP y EAS antes de activar OTP por email y push.
- Prueba restauración y acceso a documentos KYC antes de almacenar datos reales.

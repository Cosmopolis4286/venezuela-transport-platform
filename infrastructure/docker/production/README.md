# Operación de producción

Estos archivos son para un VPS Linux y **no** sustituyen el Compose local de la raíz.

## Archivos

- `compose.yml`: Caddy, Next.js, NestJS, PostgreSQL/PostGIS y migración separada.
- `api.Dockerfile` y `web.Dockerfile`: imágenes multi-stage, proceso sin root.
- `Caddyfile`: HTTPS automático, proxy y límite de carga compatible con documentos KYC.
- `postgres/init-app-role.sh`: crea el rol de runtime con privilegios DML limitados y privilegios por defecto para tablas futuras.
- `env.example`: plantillas para archivos externos.
- `deploy.sh`: valida, descarga imágenes, ejecuta migraciones y despliega.
- `backup.sh`: exporta PostgreSQL y documentos KYC a un archivo cifrado con age.

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

El workflow `.github/workflows/publish-images.yml` publica imágenes inmutables en GHCR
solo después de que el workflow **CI** de `main` termina correctamente. Usa el SHA completo del
commit como etiqueta. Configura la variable de Actions `VTP_API_DOMAIN` con el hostname de la API
(sin protocolo ni ruta).

Actualiza `VTP_API_IMAGE` y `VTP_WEB_IMAGE` en `/etc/vtp/compose.env` para apuntar al mismo SHA.
Luego, desde el checkout de producción:

```bash
sudo bash infrastructure/docker/production/deploy.sh
```

El script ejecuta migraciones antes de actualizar servicios y comprueba la API y la web por HTTPS.

## Backups cifrados

Genera una clave age fuera del VPS y conserva la clave privada en un gestor seguro, separada del
servidor. Configura la clave pública:

```bash
export VTP_BACKUP_AGE_RECIPIENT='age1...'
sudo --preserve-env=VTP_BACKUP_AGE_RECIPIENT bash infrastructure/docker/production/backup.sh
```

Programa el script diariamente y sincroniza `*.tar.gz.age` y `*.sha256` a almacenamiento externo.
El script no implementa retención ni subida remota; ambas son tareas operativas obligatorias.

## Restauración (ensayar antes de producción)

1. Descifra con la clave privada age en un host seguro y verifica SHA-256.
2. Extrae `database.dump` y `uploads.tar.gz` en un directorio temporal.
3. Restaura PostgreSQL/PostGIS en una instancia vacía con `pg_restore` y el rol propietario.
4. Restaura `uploads/` en el volumen persistente de la API conservando permisos.
5. Arranca una versión compatible y valida reservas, documentos KYC y healthchecks.

No ejecutes una restauración sobre la base activa sin ventana de mantenimiento y copia previa.

## Limitaciones antes de abrir al público

- No existe integración de pagos automáticos: `PAYMENT_PROVIDER=manual` requiere cuentas
  verificadas y revisión humana. Nunca habilites el proveedor simulado en producción.
- Mantén una sola instancia de API mientras el rate limiter use memoria local.
- Configura SMTP y EAS antes de activar OTP por email y push.
- Prueba restauración y acceso a documentos KYC antes de almacenar datos reales.

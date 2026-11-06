# Operación de producción

Estos archivos son para un VPS Linux y **no** sustituyen el Compose local de la raíz.

## Archivos

- `compose.yml`: Caddy, Next.js, NestJS, PostgreSQL/PostGIS y migración de una sola ejecución.
- `api.Dockerfile` y `web.Dockerfile`: imágenes multi-stage, proceso sin root.
- `Caddyfile`: HTTPS automático y proxy inverso.
- `env.example`: plantilla; copiar cada bloque a su archivo externo.
- `deploy.sh`: valida, descarga imágenes, ejecuta migraciones y despliega.
- `backup.sh`: exporta PostgreSQL y documentos KYC a un archivo cifrado con age.

## Preparar el VPS

1. Instala Docker Engine + Compose v2 y `curl`, `age`.
2. Crea `/etc/vtp` y copia las variables de `env.example` en:
   - `/etc/vtp/compose.env`
   - `/etc/vtp/postgres.env`
   - `/etc/vtp/api.env`
3. Sustituye todos los dominios y secretos de ejemplo. Genera `AUTH_SECRET` con
   `openssl rand -hex 32` y contraseñas con `openssl rand -base64 36`.
4. Protege los archivos: `chown root:root /etc/vtp/*.env && chmod 600 /etc/vtp/*.env`.
5. Configura DNS A/AAAA para ambos dominios hacia el VPS y abre solo SSH, TCP 80 y TCP 443.
6. Asegura que el repositorio/registro GHCR sea accesible desde el servidor. Para paquetes privados,
   inicia sesión con un token de solo lectura de paquetes; no uses un PAT con permisos de escritura.

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

El script falla antes de actualizar servicios si falta configuración, si Compose no valida o si
las migraciones no terminan. Después comprueba la API y la web por HTTPS.

## Backups cifrados

Genera una clave age de respaldo fuera del VPS y conserva la clave privada en un gestor seguro,
separada del servidor. Configura la clave pública:

```bash
export VTP_BACKUP_AGE_RECIPIENT='age1...'
sudo --preserve-env=VTP_BACKUP_AGE_RECIPIENT bash infrastructure/docker/production/backup.sh
```

Programa el script diariamente con systemd timer o cron. Sincroniza los archivos
`*.tar.gz.age` y `*.sha256` a otro proveedor/servidor. El script deja los archivos locales con
permisos restrictivos, pero **no los sube fuera del VPS ni implementa retención**: configura
retención y copia externa en el destino de backup.

## Restauración (ensayar antes de producción)

1. Descifra con la clave privada age en un host seguro y verifica SHA-256.
2. Extrae `database.dump` y `uploads.tar.gz` en un directorio temporal.
3. Restaura la base en una instancia PostgreSQL/PostGIS vacía con `pg_restore --clean --if-exists`
   usando el rol propietario apropiado.
4. Restaura `uploads/` en el volumen persistente de la API conservando permisos.
5. Arranca la versión de aplicación compatible y valida reservas, documentos KYC y healthchecks.

No ejecutes una restauración sobre la base de datos activa sin ventana de mantenimiento y copia
previa. La clave privada age no debe estar en el VPS ni en el repositorio.

## Limitaciones antes de abrir al público

- La integración de pagos automáticos no existe; `PAYMENT_PROVIDER=manual` exige cuentas
  verificadas y revisión humana. No habilites el proveedor simulado en producción.
- El script de backup genera una copia local cifrada; la copia externa y la prueba de restauración
  siguen siendo tareas operativas obligatorias.
- Mantén una sola instancia de API mientras el rate limiter use memoria local.
- Configura SMTP y EAS antes de activar OTP por email y push.

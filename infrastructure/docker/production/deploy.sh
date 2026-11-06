# Preparación del despliegue en un VPS

> No hay servicios desplegados todavía. La configuración de producción vive en
> `infrastructure/docker/production/`; el Compose de la raíz es exclusivamente para desarrollo.

## Topología

```text
Internet :80/:443
  └─ Caddy (TLS automático)
      ├─ app.<dominio> → Next.js
      └─ api.<dominio> → NestJS
                          └─ PostgreSQL 18 + PostGIS (red privada)
```

Un VPS Ubuntu 24.04 LTS con 2 vCPU / 4 GB RAM sirve para una beta pequeña. No publiques
PostgreSQL ni puertos internos de API/web. Solo abre SSH, TCP 80 y TCP 443.

## Preparación

1. Crea usuario sudo no-root; desactiva SSH por contraseña y login root; usa llaves.
2. Activa UFW (SSH/80/443), actualizaciones de seguridad y fail2ban.
3. Instala Docker Engine + Compose v2, `curl` y `age`.
4. Crea DNS A/AAAA para los dominios web y API apuntando al VPS.
5. Crea `/etc/vtp` y copia los bloques de `infrastructure/docker/production/env.example` a
   `compose.env`, `postgres.env`, `migrate.env` y `api.env`.
6. Genera contraseñas distintas para owner y app y `AUTH_SECRET` con
   `openssl rand -hex 32`. No reutilices valores de ejemplo.
7. Protege secretos: `chown root:root /etc/vtp/*.env && chmod 600 /etc/vtp/*.env`.

La base se inicializa con `vtp_owner`; el script `postgres/init-app-role.sh` crea `vtp_app`
con permisos DML y grants por defecto. La API usa `vtp_app`; el contenedor one-off `migrate`
usa `vtp_owner`. El script de inicialización solo se ejecuta sobre un volumen PostgreSQL vacío.
En instalaciones existentes, crea el rol/grants con un procedimiento de migración controlado.

## Publicación y despliegue

`.github/workflows/publish-images.yml` publica imágenes con etiqueta SHA inmutable en GHCR
cuando el workflow CI de `main` termina correctamente. Define la variable GitHub Actions
`VTP_API_DOMAIN` con el hostname real de API. Si el paquete GHCR es privado, autentica el VPS
con un token de solo lectura de paquetes.

Actualiza las imágenes en `/etc/vtp/compose.env` al mismo SHA y ejecuta:

```bash
sudo bash infrastructure/docker/production/deploy.sh
```

El script valida Compose, descarga imágenes, corre migraciones con el rol owner, actualiza API/web
y espera los healthchecks y URLs HTTPS. La web necesita que `NEXT_PUBLIC_API_BASE_URL` se haya
compilado como `https://<api>/api/v1`.

## Pagos, correo y notificaciones

- `PAYMENT_PROVIDER=manual`: carga cuentas reales verificadas desde el panel y exige revisión
  humana del comprobante. No hay adaptador bancario/pasarela automático implementado.
- Nunca uses `simulated` en producción.
- OTP por correo requiere SMTP real con SPF/DKIM/DMARC; hasta configurarlo deja
  `OTP_DELIVERY=disabled`. Push requiere el proyecto EAS de producción y credenciales.
- Mantén una sola instancia API mientras el rate limiter sea local en memoria.

## Backups y restauración

El script `infrastructure/docker/production/backup.sh` crea un backup cifrado con age que incluye
PostgreSQL y documentos KYC. Configura `VTP_BACKUP_AGE_RECIPIENT` con una clave pública age;
guarda la privada fuera del servidor. Programa ejecución diaria y sincroniza los archivos
`*.tar.gz.age` y `*.sha256` a almacenamiento externo. El script no implementa subida remota ni
retención, por lo que debes configurarlas fuera de él.

Ensaya la restauración en un host/base vacía antes de aceptar datos reales: verifica SHA-256,
descifra, restaura el dump con `pg_restore`, restaura `uploads/` al volumen y valida el sistema.
No restaures encima de la base activa sin mantenimiento y backup previo.

## Antes de beta pública

- [ ] Dominio/DNS y certificados emitidos.
- [ ] Secrets únicos y permisos 600.
- [ ] SMTP/OTP y EAS configurados.
- [ ] Cuentas de pago verificadas y proceso humano de conciliación documentado.
- [ ] Backups externos y prueba de restauración completada.
- [ ] Pruebas end-to-end en el VPS: compra, confirmación, QR, abordaje, cancelación y reembolso.
- [ ] Política de privacidad, términos, soporte e incidentes definidos.

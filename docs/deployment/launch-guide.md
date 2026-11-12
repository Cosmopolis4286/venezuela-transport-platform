# Guía de lanzamiento de la primera versión

Pasos, en orden, para poner en marcha la v1: **web + app Android**, con un **piloto en una ruta
suburbana**. Cada paso dice qué contratar o configurar, quién lo hace y cómo comprobar que quedó
bien. Lo técnico de cada paso está en [preparación del VPS](vps-preparation.md),
[infrastructure/docker/production](../../infrastructure/docker/production/README.md),
[copias de seguridad](backups.md) y [monitoreo](monitoring.md).

> Los precios son aproximados y cambian: confírmalos al contratar. Nada de esto se contrata
> desde el repositorio; lo hace el dueño del producto con sus propias cuentas.

## Qué incluye la v1 y qué no

| Incluye                                                                             | Queda para después                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Búsqueda en la web y en la app; compra, pago y boleto QR en la **app Android**      | App de iPhone (cuenta de Apple, 99 US$ al año) |
| Boleto abierto (suburbano) y boleto con puesto (interurbano)                        | Monedero, pases y descuentos                   |
| Pago móvil, transferencia y USDT verificados a mano por la administración (ADR-027) | Pagos automáticos con un proveedor             |
| Portal de empresas, app de transportistas (validar boletos, efectivo, cobros)       | Ubicación en vivo de las unidades              |
| Facturación en borrador (portal del SENIAT), libros de ventas y compras (ADR-031)   | Imprenta digital                               |
| Códigos de acceso y avisos por correo; push en Android                              | SMS / WhatsApp                                 |

En la web los pasajeros **buscan**; para comprar usan la app Android (o la taquilla).

## Paso 1. Dominio (dueño del producto)

- Registra un dominio (un `.com` cuesta unos 10–15 US$ al año; un `.com.ve` se gestiona en
  NIC.ve). Usa dos subdominios: `app.` para la web y `api.` para la API.
- **Comprobar:** puedes editar los registros DNS del dominio.

## Paso 2. Servidor (dueño del producto)

- Contrata un VPS Linux (Ubuntu LTS) con **2 vCPU, 4 GB de RAM y 40 GB de disco** como mínimo
  (Hetzner, DigitalOcean, Contabo u otro: unos 5–10 US$ al mes).
- Apunta `app.` y `api.` (registros A/AAAA) a la IP del VPS.
- Abre solo SSH (22), HTTP (80) y HTTPS (443).
- **Comprobar:** `ping api.tudominio` responde con la IP del VPS.

## Paso 3. Imágenes y despliegue (técnico)

1. En GitHub → Settings → Secrets and variables → Actions → **Variables**, crea `VTP_API_DOMAIN`
   con el hostname de la API (por ejemplo `api.tudominio.com`). Desde ese momento cada CI verde en
   `main` publica las imágenes en GHCR (gratis en repositorios públicos).
2. En el VPS, sigue [infrastructure/docker/production](../../infrastructure/docker/production/README.md):
   archivos `/etc/vtp/*.env` con secretos generados en el servidor, y luego
   `sudo bash infrastructure/docker/production/deploy.sh`.
3. Regístrate en la web con tu correo y luego, en el VPS, conviértete en el primer administrador:

   ```bash
   docker compose --env-file /etc/vtp/compose.env -f infrastructure/docker/production/compose.yml \
     exec api node dist/cli/platform-grant.js --email tu@correo --role admin
   ```

- **Comprobar:** `https://api.tudominio/api/v1/health/ready` responde `200`, y
  `https://app.tudominio` abre la web con candado (HTTPS de Caddy).

## Paso 4. Correo (dueño del producto + técnico)

- Contrata un servicio SMTP con tu dominio (Brevo, Resend, Zoho u otro; hay planes gratuitos con
  límite diario, suficientes para el piloto). Agrega los registros SPF y DKIM que te indique.
- En `/etc/vtp/api.env`: `MAIL_DELIVERY=smtp`, `OTP_DELIVERY=email`, `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` y `ALERT_EMAIL` (avisos de errores para ti). Vuelve a
  desplegar.
- Soporte: instala **WhatsApp Business** (gratis) en un teléfono de la empresa y pon su número en
  `SUPPORT_WHATSAPP` (`/etc/vtp/api.env`). La web y las apps muestran "Escríbenos por WhatsApp";
  no se conecta nada al sistema (ver la nota de abajo).
- **Comprobar:** regístrate en la web con un correo real y recibe el código.

> **WhatsApp:** en la v1 solo es un enlace para hablar con soporte. Los códigos y avisos siguen
> por correo. Las bibliotecas no oficiales (que imitan WhatsApp Web) violan las condiciones de
> WhatsApp y el número puede ser bloqueado; la API oficial de Meta cobra por cada mensaje que la
> empresa inicia. Se evaluará después del piloto.

## Paso 5. Copias de seguridad y monitoreo (técnico)

- Programa `infrastructure/backup/backup.sh` cada noche y ensaya `restore-check.sh` una vez antes
  de abrir ([copias de seguridad](backups.md)). Guarda la clave de `age` **fuera** del servidor.
- Configura el monitor externo gratuito de [monitoreo](monitoring.md) contra
  `/api/v1/health/ready`.
- **Comprobar:** existe una copia de la noche anterior y la restauración de prueba terminó bien.

## Paso 6. Datos de la plataforma (dueño del producto, en `/admin`)

1. **Zonas** (`/admin/zones`): crea la ciudad del piloto y actívala.
2. **Paradas** (`/admin/stops`): carga las paradas de la ruta del piloto.
3. **Política** (`/admin/settlements`): cargo por servicio (15 % por defecto) y tramos de
   reembolso.
4. **Cuentas de cobro** (`/admin/payments`): tus cuentas reales de pago móvil, banco y USDT.
5. **Facturación** (`/admin/fiscal`): razón social, RIF, domicilio, tipo de contribuyente e IVA, y
   la tasa BCV del día.
6. Completa `docs/legal/empresa.json` (razón social, RIF, domicilio, correos) y despliega.

- **Comprobar:** la búsqueda de la web muestra la ciudad, y `/admin/fiscal` dice que los datos
  están completos.

## Paso 7. App Android (dueño del producto + técnico)

1. Crea una cuenta de **Expo** (gratis) y otra de **Google Play Console** (25 US$, una sola vez).
   Ojo: una cuenta **personal** nueva debe pasar una **prueba cerrada con al menos 12
   probadores durante 14 días** antes de publicar en producción; una cuenta de **organización**
   (con número D-U-N-S) no lo necesita. Ese plazo cabe dentro del piloto.
2. Elige el identificador de cada app (no se puede cambiar después), por ejemplo
   `com.tudominio.pasajeros` y `com.tudominio.transporte`, y agrégalo en `android.package` del
   `app.json` de cada app.
3. En cada app: `npx eas-cli init` (crea el proyecto de EAS y su `projectId`, que activa el
   push), la variable de EAS `EXPO_PUBLIC_API_BASE_URL=https://api.tudominio/api` y
   `npx eas-cli build --platform android --profile production`. El plan gratuito de EAS alcanza
   para estas compilaciones (con cola).
4. En la API: `PUSH_DELIVERY=expo` (y `EXPO_ACCESS_TOKEN` si activas la seguridad reforzada).
5. Sube el `.aab` a la prueba cerrada de Google Play e invita a los probadores del piloto.
6. Pon en `ANDROID_APP_URL` el enlace de descarga (el de la prueba de Google Play, o el APK de
   EAS) y comparte siempre `https://TU-DOMINIO/es/app`: cuando pases a producción solo cambia la
   variable.

- **Comprobar:** la app instalada desde Play inicia sesión contra producción y recibe un push.

## Paso 8. Revisiones antes de abrir (dueño del producto)

- **Abogado venezolano:** términos, privacidad, reembolsos, condiciones para empresas y la
  [lista de puntos abiertos](../legal/README.md#lista-para-el-abogado) (cobro por cuenta de
  terceros, USDT).
- **Contador:** alícuota de IVA, que el pasaje no lo factura la plataforma, formato de los libros
  e IGTF ([facturación](../architecture/fiscal.md)).
- Repasa la [revisión de seguridad](security-review.md).

## Paso 9. Piloto

Sigue el [guion del piloto suburbano](../guides/piloto-suburbano.md). Al terminarlo con éxito,
pasa la app de prueba cerrada a producción en Google Play y anuncia la web.

## Antes de cada despliegue

- CI verde en `main` (GitHub Actions y CircleCI).
- Copia de seguridad del día.
- `deploy.sh` corre las migraciones antes de cambiar los servicios; si algo falla, vuelve a la
  imagen anterior ([volver atrás](vps-preparation.md#8-volver-atrás)).

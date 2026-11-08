# Revisión de seguridad (2026-11-08)

Revisión gratuita antes de producción: dependencias, configuración y los controles principales.
No sustituye una auditoría profesional (pentest), recomendable cuando haya volumen de dinero real.

## Corregido

| Hallazgo                                                                                                             | Riesgo                                                                       | Corrección                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodemailer` 7.0.13 en la API con avisos altos (inyección SMTP, DoS en el analizador de direcciones, validación TLS) | Correos manipulados o caída del envío                                        | Actualizado a 10.3.1; envío real probado contra Mailpit                                                                                                                                                                                           |
| Caddy limitaba **todas** las peticiones a 1 MB                                                                       | Los conductores no podrían subir documentos KYC (hasta 10 MiB) en producción | 11 MB para la API (la API rechaza lo que pase de `FILE_UPLOAD_MAX_BYTES`), 1 MB para la web                                                                                                                                                       |
| La web no impedía mostrarse dentro de otro sitio                                                                     | _Clickjacking_ (engañar al usuario para que pulse botones del portal)        | Cabeceras en todas las páginas: `Content-Security-Policy` (`frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; una prueba en el navegador lo verifica |
| Formularios de inicio de sesión y registro borraban lo escrito tras un error                                         | Usabilidad (no seguridad)                                                    | Los campos se conservan                                                                                                                                                                                                                           |

## Revisado y correcto

- **Rutas privadas por defecto** (guardia global), permisos por rol en cada ruta de empresa,
  rutas de dinero solo para `admin`.
- **Sesiones**: tokens opacos guardados como hash, rotación del token de refresco con detección
  de reuso; en la web, cookies `httpOnly`, `Secure` y `SameSite=Lax` (prefijo `__Host-` en
  producción); en las apps, almacenamiento seguro del teléfono.
- **Contraseñas** con scrypt; códigos de un solo uso con vencimiento y límite de intentos;
  límite de peticiones global y más estricto en autenticación.
- **API**: `helmet`, CORS con lista explícita (comodín prohibido en producción), Swagger apagado
  en producción, errores sin detalles internos, logs sin cabeceras de autenticación.
- **Archivos KYC** validados por contenido y servidos solo a revisores; purga a los 5 años.
- **Secretos** solo en archivos de entorno del servidor; ninguno en el repositorio ni en las apps.
- **Pagos simulados** imposibles en producción (la configuración lo rechaza).
- **Copias de seguridad** cifradas con una llave pública; la privada nunca está en el servidor.

## Pendiente (conocido)

| Qué                                                                       | Por qué no ahora                                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 16 avisos en dependencias de `@expo/cli` (`node-forge`, `glob`, `zod`, …) | Son de la herramienta de compilación de Expo, no viajan en las apps ni en el servidor; se resuelven al actualizar el SDK de Expo             |
| CSP completa (`script-src` con _nonces_)                                  | Next.js la permite, pero obliga a renderizar todo dinámicamente; la CSP actual ya bloquea el _clickjacking_ y las inyecciones de formularios |
| Límite de peticiones en memoria                                           | Correcto con una sola instancia de la API; pasar a Redis antes de usar varias                                                                |
| Pentest profesional                                                       | Antes de mover volúmenes grandes de dinero                                                                                                   |

Repetir esta revisión antes de cada versión importante: `pnpm audit --prod`, revisar este
documento y las cabeceras (`curl -sI https://<web>/es`).

# Política de seguridad

## Reportar una vulnerabilidad

Por favor **no abras un issue público**. Repórtala en privado a través de GitHub:
**Security → Report a vulnerability** en este repositorio (reporte privado de vulnerabilidades),
o contacta directamente a los mantenedores. Incluye los pasos para reproducirla y el commit
afectado. Intentamos acusar recibo de los reportes en un máximo de 3 días hábiles.

## Estado actual de la seguridad (de forma explícita)

La plataforma está en desarrollo y no se ha desplegado. A la fecha:

| Control                         | Estado                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticación                   | Correo + contraseña (scrypt) y códigos de un solo uso por teléfono o correo; tokens de sesión opacos, guardados como hash y rotativos, con detección de reutilización; guardia que niega por defecto. Ver `docs/architecture/authentication.md`                                                                                                    |
| Autorización                    | Roles y permisos por organización aplicados por la API (`docs/architecture/organizations.md`); los roles de personal de la plataforma solo se otorgan desde la CLI del servidor. El portal web (`/portal`, `/admin`) usa cookies de sesión httpOnly y refleja — nunca reemplaza — las verificaciones de la API (`docs/architecture/web-portal.md`) |
| Validación de entradas          | `ValidationPipe` global (lista blanca y rechazo de campos desconocidos) en todos los DTO                                                                                                                                                                                                                                                           |
| Validación de configuración     | La API no arranca con configuración inválida; en producción rechaza CORS `*`, secretos de ejemplo, contraseñas débiles de la base de datos, códigos impresos en el log y el proveedor de pagos simulado                                                                                                                                            |
| CORS                            | Lista explícita de orígenes permitidos                                                                                                                                                                                                                                                                                                             |
| Higiene de logs                 | Se ocultan las cabeceras de autorización, cookies y claves de API; no se registran cuerpos ni query strings                                                                                                                                                                                                                                        |
| Cabeceras de seguridad          | Valores por defecto de `helmet` en cada respuesta de la API                                                                                                                                                                                                                                                                                        |
| Límite de solicitudes           | Límite global por IP (`RATE_LIMIT_*`) y uno más estricto para inicio de sesión, registro y códigos (`AUTH_RATE_LIMIT_MAX`). En memoria (una sola instancia)                                                                                                                                                                                        |
| Documentos KYC                  | Archivos privados, tipo verificado por contenido, nombres de almacenamiento aleatorios, servidos solo al dueño y a los revisores de la plataforma (cada acceso de un revisor queda auditado). Ver `docs/architecture/onboarding.md`                                                                                                                |
| Registro de auditoría           | Las acciones sensibles (sesiones, organizaciones, KYC, reservas, pagos, abordaje) se registran en la tabla `audit_events`, sin datos personales en los metadatos                                                                                                                                                                                   |
| Pagos                           | Solo con el proveedor simulado; producción lo rechaza. Los datos de cuentas de pago reales irán en la configuración del servidor, nunca en el código (ADR-018)                                                                                                                                                                                     |
| Actualizaciones de dependencias | Dependabot semanal; pnpm bloquea por defecto los scripts de instalación de las dependencias                                                                                                                                                                                                                                                        |

## Reglas para quienes contribuyen

- Ningún secreto en Git, issues, PRs, logs, capturas de pantalla ni chat. Si uno se filtra,
  **rótalo** — borrar el commit no basta.
- Las variables `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` son públicas; las apps móviles no pueden guardar
  secretos.
- Los datos personales (nombres, números de cédula, teléfonos, ubicaciones, datos de pago) nunca se
  registran en logs ni se ponen en URLs. Enmascáralos en los mensajes de error.
- Todo endpoint nuevo debe indicar su regla de autorización en la revisión de código.
- Los datos de tarjetas de pago nunca deben pasar por nuestros servidores; usa los campos o la
  redirección alojados por el proveedor.

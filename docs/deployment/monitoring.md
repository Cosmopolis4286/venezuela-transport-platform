# Monitoreo (gratuito)

Tres piezas, ninguna de pago:

## 1. Disponibilidad: ¿responde la API?

Un monitor externo consulta cada pocos minutos:

| URL                                 | Qué indica                                                           |
| ----------------------------------- | -------------------------------------------------------------------- |
| `https://<api>/api/v1/health/ready` | `200` si la API responde **y** llega a la base de datos; `503` si no |
| `https://<web>/es`                  | La web pública carga                                                 |

Opciones sin costo:

- **Uptime Kuma** en el mismo servidor (`docker run -d --restart=always -p 127.0.0.1:3001:3001 louislam/uptime-kuma:1`),
  con avisos por correo o Telegram. Si el servidor entero cae, no avisa: complétalo con la opción
  siguiente.
- Un servicio externo con plan gratuito (UptimeRobot, Better Stack, Healthchecks.io u otro), con
  intervalo de 5 minutos y aviso por correo.

Configúralo para avisar después de **2 fallos seguidos**, para no alertar por un reinicio.

## 2. Errores inesperados: correo al equipo

Si `ALERT_EMAIL` tiene un correo y el envío de correos está activo (`MAIL_DELIVERY=smtp`), la API
envía un correo cada vez que responde con un error 500 inesperado (no los 4xx: esos son errores
del usuario). Lleva la ruta, la hora y la traza; **no** lleva el cuerpo de la petición ni datos
personales. Para no llenar el buzón durante una caída: el mismo error se envía como máximo una vez
cada 15 minutos, y nunca más de 10 alertas por hora. El detalle completo queda en los registros
(buscar por el `x-request-id`).

## 3. Registros

Los registros salen en JSON por la salida estándar; Docker los guarda con rotación (ver
[preparación del VPS](vps-preparation.md#7-chequeos-de-salud-y-monitoreo)). Consultar:
`docker compose logs api --since 1h | grep '"level":50'` (errores).

## Tareas periódicas que conviene vigilar

La API registra en los logs el resultado de la purga diaria de datos vencidos
(`Retention sweep: {...}`, ver [conservación y borrado](../legal/conservacion-y-borrado.md)) y de
los recordatorios de viaje. Un `Retention sweep failed` merece revisión.

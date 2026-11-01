# Notificaciones: push y correo

Módulo `apps/api/src/modules/notifications`, el mailer en `apps/api/src/mail`, los textos en
`packages/shared-types/src/i18n/notification-messages.ts` y el registro de dispositivos en
`packages/mobile-core/src/push`. Decisión: ADR-026 (push en las apps + correo por SMTP).

## Qué se avisa

| Aviso                    | A quién                                                          | Push (app)     | Correo |
| ------------------------ | ---------------------------------------------------------------- | -------------- | ------ |
| Código de acceso         | Quien inicia sesión con su correo (`OTP_DELIVERY=email`)         | —              | ✅     |
| Pago confirmado          | El pasajero                                                      | Pasajeros      | ✅     |
| Reserva pagada cancelada | El pasajero (con el monto a devolver, si corresponde)            | Pasajeros      | ✅     |
| Reembolso enviado        | El pasajero (con la referencia de la devolución)                 | Pasajeros      | ✅     |
| Recordatorio del viaje   | El pasajero, `TRIP_REMINDER_HOURS` (3) horas antes de abordar    | Pasajeros      | —      |
| Viaje asignado           | El conductor, cuando un despachador lo asigna a una salida       | Transportistas | —      |
| Solicitud de taxi        | Los conductores de las líneas activas que operan en ese terminal | Transportistas | —      |
| Taxi aceptado            | El pasajero (placa y tarifa)                                     | Pasajeros      | —      |

Los textos están en español, inglés y portugués de Brasil. Se usa el idioma del dispositivo con el
que la persona usó la app por última vez; sin dispositivo, español. Los códigos de acceso van en
español (todavía no se sabe el idioma de quien entra).

## Cómo funciona

- **Nunca frenan ni rompen la acción.** El servicio que paga, cancela o asigna llama a
  `NotificationsService.send()` (o `later()`, que también arma el aviso en segundo plano) después de
  su transacción. Si el envío falla, queda registrado y la acción sigue hecha.
- **Registro** (`notifications`): a quién, qué tipo, por qué canal, si salió o falló, y de qué
  reserva, viaje o taxi se trata. No guarda el texto.
- **Dispositivos** (`push_devices`): un token de Expo por teléfono, con la app (`passenger` o
  `transport`) y el idioma. Las apps lo registran al iniciar sesión
  (`POST /me/push-devices`) y lo quitan al salir (`DELETE /me/push-devices`). Si otra persona
  inicia sesión en ese teléfono, el token pasa a ella. Cuando Expo responde que la app ya no está
  instalada (`DeviceNotRegistered`), el token se borra.
- **Recordatorios**: cada 5 minutos, un solo `UPDATE … RETURNING` marca las reservas pagadas que
  salen dentro de `TRIP_REMINDER_HOURS` (`bookings.reminder_sent_at`). Cada reserva se recuerda
  una vez aunque haya varias instancias de la API.
- Tocar una notificación abre la reserva, el taxi o el viaje del que habla.

## Proveedores

| Variable        | Valores                        | Por defecto                                     |
| --------------- | ------------------------------ | ----------------------------------------------- |
| `MAIL_DELIVERY` | `console`, `smtp`, `disabled`  | `console` fuera de producción, si no `disabled` |
| `PUSH_DELIVERY` | `console`, `expo`, `disabled`  | `console` fuera de producción, si no `disabled` |
| `OTP_DELIVERY`  | `console`, `email`, `disabled` | `console` (se rechaza en producción)            |

- **Correo**: cualquier servidor SMTP (`SMTP_*`, `MAIL_FROM`), con `nodemailer`. En desarrollo,
  Mailpit (`pnpm infra:up:mail`, ver [instalación local](../development/local-setup.md)). En
  producción hace falta una cuenta SMTP con un dominio propio verificado (SPF y DKIM) para que los
  correos no caigan en spam.
- **Push**: el servicio de push de Expo (`https://exp.host/--/api/v2/push/send`), sin SDK, en
  lotes de 100. Las apps necesitan un **id de proyecto de EAS** (`extra.eas.projectId` en
  `app.json`) para obtener el token: hasta que se cree el proyecto de Expo (pendiente con los
  nombres de los paquetes de Android), las apps no se registran y solo llegan los correos. En la
  web no hay push.
- La configuración rechaza `console` en producción para correo, push y códigos.

## Endpoints (`/api/v1`)

| Método y ruta             | Quién      |
| ------------------------- | ---------- |
| `POST /me/push-devices`   | Con sesión |
| `DELETE /me/push-devices` | Con sesión |

## Todavía no

Códigos por SMS o WhatsApp, avisos al pasajero cuando la empresa cambia o cancela una salida,
preferencias para apagar tipos de aviso, y los recibos de entrega de Expo (hoy solo se lee la
respuesta inmediata).

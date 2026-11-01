# Autenticación

Implementada en `apps/api/src/modules/identity`. Contratos en `packages/shared-types/src/api/auth.ts`.

## Formas de iniciar sesión

| Método                                                | Quién                                             | Endpoints                                            |
| ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Correo + contraseña                                   | Pasajeros (y cualquiera con una cuenta de correo) | `POST /auth/register`, `POST /auth/login`            |
| Código de un solo uso por SMS, WhatsApp o correo      | Pasajeros; el primer uso crea la cuenta           | `POST /auth/otp/request` → `POST /auth/otp/verify`   |
| Agregar o verificar un teléfono o correo en la cuenta | Cualquier usuario con sesión                      | `POST /me/contact-verification/request` → `/confirm` |

Todas las rutas están bajo `/api/v1`. Conductores, tripulaciones y operadores de terminal usan las
mismas cuentas; lo que pueden hacer dentro de una empresa viene de sus **membresías en
organizaciones** ([organizations.md](organizations.md)), que se obtienen por invitación o después
de una solicitud aprobada (KYC, [onboarding.md](onboarding.md)). Iniciar sesión nunca da acceso a
una organización por sí solo.

## Tokens y sesiones

- Cada inicio de sesión crea una **sesión** para un cliente (`web`, `passenger`, `transport`) y
  devuelve un **token de acceso** (15 min) y un **token de renovación** (30 días). Ambos son
  cadenas aleatorias opacas (`vtp_at_…`, `vtp_rt_…`); la base de datos solo guarda su HMAC-SHA256
  (con la clave `AUTH_SECRET`).
- Envía `Authorization: Bearer <accessToken>`. Cuando una solicitud falla con `SESSION_EXPIRED`,
  llama una vez a `POST /auth/refresh` y reintenta. Si la renovación también falla, lleva al
  usuario a iniciar sesión.
- **La renovación rota los dos tokens.** Presentar un token de renovación que ya fue rotado revoca
  toda la sesión (fue robado o reutilizado). Por eso los clientes deben **serializar las
  renovaciones** — nunca renovar dos veces en paralelo.
- `POST /auth/logout` revoca solo la sesión actual. Los usuarios suspendidos no pueden iniciar
  sesión ni renovar.

### Dónde guardan los tokens los clientes

| Cliente      | Almacenamiento                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apps móviles | `expo-secure-store` (Keychain / Android Keystore). Nunca AsyncStorage.                                                                                                         |
| Portal web   | El servidor Next.js guarda los tokens en cookies `httpOnly`, `Secure`, `SameSite=Lax` y llama a la API desde el servidor. Los tokens nunca llegan al JavaScript del navegador. |

## Contraseñas

- scrypt (N=2^17, r=8, p=1, sal de 16 bytes) con el `crypto` integrado de Node — sin dependencias
  nativas.
- De 10 a 128 caracteres, sin reglas de composición (NIST SP 800-63B). El Unicode se normaliza con
  NFKC.
- Una contraseña incorrecta y un correo inexistente devuelven el mismo error
  `INVALID_CREDENTIALS` y tardan lo mismo (se verifica un hash ficticio cuando la cuenta no
  existe).

## Códigos de un solo uso

- 6 dígitos, válidos `OTP_TTL_MINUTES` (5), con `OTP_MAX_ATTEMPTS` (5) intentos fallidos, de un
  solo uso (garantizado con una actualización condicional). Los códigos se guardan como hash.
- Por destino: un código cada `OTP_RESEND_SECONDS` (60) y como máximo `OTP_MAX_PER_HOUR` (5), lo
  que también limita el gasto en SMS. Por IP: `AUTH_RATE_LIMIT_MAX` (10) solicitudes por minuto en
  todas las rutas de autenticación.
- Los teléfonos se normalizan a E.164 con Venezuela como región por defecto
  (`0412-1234567` → `+584121234567`).
- El envío es intercambiable (`OtpSender` en `otp/otp-sender.ts`):
  - `OTP_DELIVERY=console` — desarrollo: imprime el código en el log de la API.
  - `OTP_DELIVERY=email` — envía los códigos de correo con el mailer (`MAIL_DELIVERY=smtp`, ver
    [notifications.md](notifications.md)); pedir un código por SMS o WhatsApp responde 503
    (ADR-026). En desarrollo se leen en Mailpit (`pnpm infra:up:mail`).
  - `OTP_DELIVERY=disabled` — las solicitudes fallan con 503. Producción se niega a arrancar con
    `console`.
  - **Para agregar SMS o WhatsApp**: implementa `OtpSender` (o amplía `EmailOtpSender` para que
    delegue los otros canales), agrega sus credenciales al esquema de configuración y
    selecciónalo en `identity.module.ts`.

## Códigos de error que los clientes deben manejar

| Código                | Estado | Significado / qué hacer en el cliente                                                            |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `UNAUTHORIZED`        | 401    | No se envió token → iniciar sesión                                                               |
| `SESSION_EXPIRED`     | 401    | Token inválido o vencido → renovar una vez; si no, iniciar sesión                                |
| `INVALID_CREDENTIALS` | 401    | Correo o contraseña incorrectos                                                                  |
| `OTP_INVALID`         | 400    | Código incorrecto o ya usado                                                                     |
| `OTP_EXPIRED`         | 400    | Código vencido o demasiados intentos → pedir uno nuevo                                           |
| `RATE_LIMITED`        | 429    | Esperar (`resendAvailableAt` indica cuándo, para los códigos)                                    |
| `CONFLICT`            | 409    | El correo o teléfono ya pertenece a otra cuenta                                                  |
| `FORBIDDEN`           | 403    | Cuenta suspendida                                                                                |
| `SERVICE_UNAVAILABLE` | 503    | El envío de códigos no está configurado para ese canal (hoy, SMS y WhatsApp) → ofrecer el correo |

## Eventos de auditoría

`auth.register`, `auth.login.password`, `auth.login.password_failed`, `auth.login.otp`,
`auth.otp.requested`, `auth.refresh.reuse_detected`, `auth.logout`, `user.contact_verified`,
`user.profile_updated` — guardados en `audit_events` con el id del usuario, la IP y metadatos no
sensibles.

## Todavía no implementado

Códigos por SMS o WhatsApp (sin proveedor contratado), restablecer la contraseña (reutilizará los
códigos de un solo uso), ver y revocar las otras sesiones, inicio de sesión con redes sociales y
doble factor para las cuentas del personal.

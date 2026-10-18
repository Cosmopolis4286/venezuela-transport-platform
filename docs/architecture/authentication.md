# Authentication

Implemented in `apps/api/src/modules/identity`. Contracts in `packages/shared-types/src/api/auth.ts`.

## Ways to sign in

| Method                                     | Who                                            | Endpoints                                            |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| E-mail + password                          | Passengers (and anyone with an e-mail account) | `POST /auth/register`, `POST /auth/login`            |
| One-time code by SMS, WhatsApp or e-mail   | Passengers; first use creates the account      | `POST /auth/otp/request` → `POST /auth/otp/verify`   |
| Add/verify a phone or e-mail on an account | Any signed-in user                             | `POST /me/contact-verification/request` → `/confirm` |

All paths are under `/api/v1`. Drivers, crews and terminal operators use the same accounts;
what they may do inside a company comes from **organization memberships** (next module), granted
by invitation or after an approved application (KYC). Signing in never grants organization access
by itself.

## Tokens and sessions

- Every sign-in creates a **session** for one client (`web`, `passenger`, `transport`) and returns
  an **access token** (15 min) and a **refresh token** (30 days). Both are opaque random strings
  (`vtp_at_…`, `vtp_rt_…`); the database stores only their HMAC-SHA256 (keyed with `AUTH_SECRET`).
- Send `Authorization: Bearer <accessToken>`. When a request fails with `SESSION_EXPIRED`, call
  `POST /auth/refresh` once and retry. If refresh also fails, send the user to sign in.
- **Refresh rotates both tokens.** Presenting a refresh token that was already rotated revokes the
  whole session (it was stolen or replayed). Clients must therefore **serialize refresh calls** —
  never refresh twice in parallel.
- `POST /auth/logout` revokes the current session only. Suspended users cannot sign in or refresh.

### Where clients keep tokens

| Client      | Storage                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile apps | `expo-secure-store` (Keychain / Android Keystore). Never AsyncStorage.                                                                            |
| Web portal  | Next.js server keeps tokens in `httpOnly`, `Secure`, `SameSite=Lax` cookies and calls the API server-side. Tokens never reach browser JavaScript. |

## Passwords

- scrypt (N=2^17, r=8, p=1, 16-byte salt) via Node's built-in `crypto` — no native dependency.
- 10–128 characters, no composition rules (NIST SP 800-63B). Unicode is NFKC-normalized.
- Wrong password and unknown e-mail return the same `INVALID_CREDENTIALS` error and take the same
  time (a dummy hash is verified when the account does not exist).

## One-time codes

- 6 digits, valid `OTP_TTL_MINUTES` (5), `OTP_MAX_ATTEMPTS` (5) wrong guesses, single use
  (enforced with a conditional update). Codes are stored hashed.
- Per destination: one code every `OTP_RESEND_SECONDS` (60) and at most `OTP_MAX_PER_HOUR` (5),
  which also caps SMS spend. Per IP: `AUTH_RATE_LIMIT_MAX` (10) requests/minute on all auth routes.
- Phone numbers are normalized to E.164 with Venezuela as the default region
  (`0412-1234567` → `+584121234567`).
- Delivery is pluggable (`OtpSender` in `otp/otp-sender.ts`):
  - `OTP_DELIVERY=console` — development: prints the code to the API log.
  - `OTP_DELIVERY=disabled` — requests fail with 503. Use this in production until a provider is
    integrated. Production refuses to start with `console`.
  - **To add a provider** (e.g. an SMS gateway, WhatsApp Business, an e-mail service): implement
    `OtpSender`, add its credentials to the env schema, and select it in `identity.module.ts`.

## Error codes clients should handle

| Code                  | Status | Meaning / client action                               |
| --------------------- | ------ | ----------------------------------------------------- |
| `UNAUTHORIZED`        | 401    | No token sent → sign in                               |
| `SESSION_EXPIRED`     | 401    | Token invalid/expired → refresh once, else sign in    |
| `INVALID_CREDENTIALS` | 401    | Wrong e-mail or password                              |
| `OTP_INVALID`         | 400    | Wrong or already-used code                            |
| `OTP_EXPIRED`         | 400    | Code expired or too many attempts → request a new one |
| `RATE_LIMITED`        | 429    | Wait (`resendAvailableAt` tells when for codes)       |
| `CONFLICT`            | 409    | E-mail/phone already belongs to another account       |
| `FORBIDDEN`           | 403    | Account suspended                                     |
| `SERVICE_UNAVAILABLE` | 503    | Code delivery not configured                          |

## Audit events

`auth.register`, `auth.login.password`, `auth.login.password_failed`, `auth.login.otp`,
`auth.otp.requested`, `auth.refresh.reuse_detected`, `auth.logout`, `user.contact_verified`,
`user.profile_updated` — stored in `audit_events` with user id, IP and non-sensitive metadata.

## Not implemented yet

Password reset (will reuse one-time codes), listing/revoking other sessions, organization roles
and permissions, KYC, social login, 2FA for staff accounts.

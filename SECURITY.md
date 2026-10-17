# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting),
or contact the maintainers directly. Include steps to reproduce and the affected commit.
We aim to acknowledge reports within 3 business days.

## Current security status (be explicit)

This repository is an engineering foundation. As of now:

| Control                        | Status                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication / authorization | **Not implemented.** No endpoint other than health checks exists. `/portal` in the web app is a placeholder with no access control.         |
| Input validation               | Global `ValidationPipe` (whitelist + reject unknown fields) ready for DTOs                                                                  |
| Config validation              | API refuses to start with invalid config; production rejects `*` CORS and weak DB passwords                                                 |
| CORS                           | Explicit allowlist                                                                                                                          |
| Logging hygiene                | Authorization/cookie/API-key headers redacted; bodies and query strings not logged                                                          |
| Security headers               | `helmet` defaults on every API response                                                                                                     |
| Rate limiting                  | Global per-IP limit (`RATE_LIMIT_*`), in-memory (single instance). Stricter per-route limits needed for login/OTP endpoints when they exist |
| Audit log                      | **Not implemented**                                                                                                                         |
| Dependency updates             | Dependabot weekly; pnpm blocks dependency install scripts by default                                                                        |

## Rules for contributors

- No secrets in Git, issues, PRs, logs, screenshots or chat. If one leaks, **rotate it** — deleting
  the commit is not enough.
- `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variables are public; mobile apps cannot keep secrets.
- Personal data (names, cédula/ID numbers, phone numbers, locations, payment data) must never be
  logged or placed in URLs. Mask it in error messages.
- Every future endpoint must state its authorization rule in code review.
- Payment card data must never touch our servers; use a provider's hosted fields/redirect.

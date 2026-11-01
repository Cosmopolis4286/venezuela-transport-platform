# Pruebas

Qué se prueba, dónde y cómo correrlo. La CI (GitHub Actions, `.github/workflows/ci.yml`) corre todo
esto en cada pull request; ver [flujo del repositorio](repository-workflow.md).

## Resumen

| Tipo                       | Dónde                                               | Herramienta        | Comando                                                                               |
| -------------------------- | --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| Unitarias de la API        | `apps/api/src/**/*.spec.ts`                         | Vitest             | `pnpm --filter @vtp/api test`                                                         |
| e2e de la API              | `apps/api/test/*.e2e-spec.ts` (con PostgreSQL real) | Vitest + supertest | `E2E_EXPECT_DATABASE=true pnpm test:e2e`                                              |
| Contratos compartidos      | `packages/shared-types/src/**/*.test.ts`            | Vitest             | `pnpm --filter @vtp/shared-types test`                                                |
| Núcleo móvil               | `packages/mobile-core/src/**/*.test.ts`             | Vitest             | `pnpm --filter @vtp/mobile-core test`                                                 |
| Web                        | `apps/web/src/**/*.test.ts`                         | Vitest             | `pnpm --filter @vtp/web test`                                                         |
| Apps móviles               | `apps/*-mobile/src/**/*.test.ts`                    | Jest (jest-expo)   | `pnpm --filter @vtp/passenger-mobile test`                                            |
| Todo lo anterior salvo e2e | —                                                   | Turborepo          | `pnpm check` (lint + tipos + pruebas)                                                 |
| Bundles móviles            | —                                                   | `expo export`      | `pnpm turbo run export --filter=@vtp/passenger-mobile --filter=@vtp/transport-mobile` |

## Pruebas e2e de la API

Cada archivo levanta la aplicación NestJS completa contra la base de datos local:

```bash
pnpm infra:up
pnpm db:migrate
E2E_EXPECT_DATABASE=true pnpm test:e2e          # todas
cd apps/api && E2E_EXPECT_DATABASE=true pnpm exec vitest run --config ./vitest.config.e2e.ts test/settlements.e2e-spec.ts
```

- Sin `E2E_EXPECT_DATABASE=true` se saltan (para que `pnpm check` funcione sin Docker).
- Cada prueba crea sus propios usuarios, empresas y paradas con nombres aleatorios, así que pueden
  correr sobre una base con datos y en cualquier orden. No borres datos de otras pruebas ni cambies
  la política general sin volver a dejarla como estaba.
- Los envíos externos se reemplazan por dobles que capturan lo enviado: `OTP_SENDER` (códigos),
  `PUSH_SENDER` y `MAILER` (notificaciones). Ver `test/notifications.e2e-spec.ts`.
- Para mover el tiempo (un apartado vencido, un viaje a 10 horas), las pruebas actualizan la fila
  con SQL (`departs_at = now() + interval '10 hours'`), nunca esperan.
- `NotificationsService.settled()` espera a que terminen los avisos en segundo plano;
  `TripRemindersService.sweep()` corre el barrido de recordatorios a mano.

| Archivo                        | Cubre                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `auth`, `rate-limit`           | Registro, contraseña, códigos, renovación, límites                      |
| `organizations`, `onboarding`  | Organizaciones, roles, invitaciones, revisión KYC con documentos        |
| `network`, `fleet`             | Paradas, rutas, tarifas, horarios, búsqueda; mapas de puestos           |
| `bookings`, `payments`         | Apartados, puestos, pagos con el proveedor simulado, boletos y abordaje |
| `settlements`, `cancellations` | Libro, comisión, políticas, pagos a empresas, reembolsos, cancelaciones |
| `dispatch`, `taxi`             | Vehículos y conductores por salida; taxis de punta a punta              |
| `notifications`                | Dispositivos, push y correo, recordatorios                              |
| `health`                       | Sondas de vida y disponibilidad                                         |

## Pruebas en el navegador

Todavía no hay una batería automática en la CI. Los flujos de la web y de las apps (en su vista
previa web) se prueban con guiones de Playwright contra una compilación de producción antes de
cada pull request grande:

1. `pnpm build`, luego la API (`node dist/main.js` en `apps/api`), la web (`pnpm start` en
   `apps/web`) y, si hace falta, la app con `npx expo start --web` en `apps/passenger-mobile`.
2. Datos: un guion que llama a la API para crear usuarios, una empresa, una ruta y reservas.
3. Playwright ya está instalado en el entorno de desarrollo en la nube (`chromium.launch()`); en tu
   computadora, `npx playwright install chromium`.

La vista previa web de las apps guarda la sesión en memoria: navega dentro de la app en vez de
recargar la página. Agregar estas pruebas a la CI está en los
[riesgos de la hoja de ruta](../roadmap.md#riesgos-y-deuda-técnica).

## Qué probar al agregar algo

- Una regla de negocio nueva → un caso en la e2e del módulo, incluidos los rechazos (403, 404,
  409 con su `reason`).
- Cálculos de dinero, fechas o textos → pruebas unitarias puras (`ledger.spec.ts`,
  `money.spec.ts`, `settlements.test.ts`).
- Textos nuevos de una app → el compilador exige las tres traducciones; `messages.test.ts`
  comprueba que no queden vacías.
- Una variable de entorno nueva → un caso en `env.schema.spec.ts`.

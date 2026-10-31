# Flujo del repositorio

## Ramas

- `main` — siempre lista para publicar; protegida. Los cambios solo entran por pull requests con
  la CI en verde.
- Ramas de corta vida desde `main`, con el nombre `<tipo>/<descripción-corta>`:
  `feat/bus-search-api`, `fix/web-cors-origin`, `chore/upgrade-expo-59`, `docs/vps-backups`.
- Haz rebase o fusiona `main` en tu rama para mantenerla al día; borra la rama después de
  fusionar.
- No hay una rama `develop` de larga vida hasta que exista un proceso de publicación real que la
  necesite.

Ajustes recomendados de GitHub para `main` (_Settings → Branches → Add rule_): exigir un pull
request, exigir los checks de **CI** (GitHub Actions; ver más abajo), exigir que la rama esté al día y bloquear los force push y el
borrado.

## Commits — Conventional Commits

```
<tipo>(<alcance>): <resumen en imperativo, ≤ 72 caracteres>

<cuerpo opcional: qué y por qué, no cómo>

<pie opcional: BREAKING CHANGE: ..., Closes #123>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.
Alcances: `web`, `passenger`, `transport`, `api`, `shared-types`, `infra`, `deps`, `ci`.

Ejemplos: `feat(api): add terminals module with nearest-terminal query`,
`fix(passenger): use 10.0.2.2 for the Android emulator API URL`,
`chore(deps): upgrade Expo to SDK 59`. Los mensajes de commit se escriben en inglés, como el
código.

## Pull requests

1. PRs pequeños y enfocados (idealmente menos de ~400 líneas cambiadas sin contar el lockfile).
2. Llena la plantilla del PR; describe cómo lo probaste.
3. `pnpm check` debe pasar en local; la CI debe estar en verde.
4. Un cambio de contrato en `packages/shared-types` actualiza a todos sus consumidores en el mismo
   PR.
5. Fusiona con squash y un título en formato Conventional Commit.

## Revisión de código

Quien revisa comprueba, en este orden:

1. **Corrección y alcance** — ¿hace lo que pide el issue, y nada ajeno?
2. **Seguridad y privacidad** — sin secretos, sin datos personales en logs ni URLs, autorización
   en cada endpoint nuevo, entradas validadas con DTO.
3. **Límites** — los módulos se comunican por servicios exportados; no se comparte interfaz entre
   web y móvil; los tipos compartidos no dependen de ningún framework.
4. **Datos** — las migraciones son reversibles o siguen expandir/contraer; índices para las
   consultas nuevas.
5. **Pruebas y documentación** — el comportamiento nuevo está probado; la documentación y los
   `.env.example` están actualizados.

Si trabajas sola o solo: igual abre PRs (corre la CI y el historial queda legible) y revisa tu
propio diff en GitHub antes de fusionar.

## Integración continua (GitHub Actions)

`.github/workflows/ci.yml` (**CI**) corre en cada pull request y en cada push a `main`, en las
máquinas de GitHub, gratis porque el repositorio es público (ADR-023). Sus cuatro trabajos corren
en paralelo:

| Trabajo         | Qué comprueba                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `quality`       | `pnpm format:check`, lint, tipos, pruebas unitarias y compilación de la web y la API                                              |
| `api-e2e`       | Las migraciones se aplican dos veces en PostgreSQL + PostGIS, ningún cambio de esquema queda sin migración, pasan las pruebas e2e |
| `mobile-bundle` | Las dos apps Expo se empaquetan para Android e iOS (solo JS, sin credenciales de firma)                                           |
| `docker-images` | El Compose de producción es válido, las imágenes de la API y la web se construyen y la de la web responde por HTTP                |

Los pull requests de forks también se construyen: corren en máquinas desechables, con un token de
solo lectura y sin secretos. El pipeline no tiene secretos: las credenciales de la base de datos y
las URLs públicas son valores de prueba desechables.

**Ajustes recomendados en GitHub (dueño del repositorio):**

1. _Settings → Branches_ (o _Rules_): exige los checks de **CI** (`Lint, typecheck, test, build`,
   `API e2e (PostgreSQL + PostGIS)`, `Mobile bundles (Android + iOS JS)`, `Production images`)
   antes de fusionar en `main`.
2. _Settings → Actions → General_: en **Fork pull request workflows**, exige aprobación para todos
   los colaboradores externos, así nadie usa tu CI sin que lo revises.
3. _Settings → Code security_: activa **Secret scanning** con **Push protection** (bloquea un push
   que traiga una clave) y, si quieres, **Code scanning** (CodeQL).

### CircleCI (opcional)

`.circleci/config.yml` corre los mismos cuatro trabajos y sigue funcionando si se configura;
ya no hace falta.

1. En CircleCI, _Projects → Set Up Project_ para `venezuela-transport-platform`, eligiendo usar el
   `.circleci/config.yml` existente (mejor con la GitHub App de CircleCI, que publica los
   resultados como checks de GitHub).
2. _Project Settings → Advanced_: activa **Auto-cancel redundant workflows** (un push nuevo
   cancela la corrida anterior de la misma rama) y deja desactivado **Only build pull requests**,
   para que `main` se compile después de cada fusión.
   `docker-images` usa una máquina virtual (executor `machine`), que cuesta más créditos que los
   trabajos con Docker.

### Runner propio (GitHub Actions)

`.github/workflows/self-hosted-ci.yml` corre los mismos cuatro trabajos en un runner de GitHub
Actions en la computadora del mantenedor (ADR-022). Con el repositorio público solo se lanza a mano
(_Actions → CI (self-hosted, manual) → Run workflow_). Instalación:
[self-hosted-runner.md](self-hosted-runner.md).

## Actualización de dependencias

- Dependabot (`.github/dependabot.yml`) abre PRs agrupados cada semana para npm y cada mes para
  las imágenes Docker y las acciones de GitHub. Las imágenes de `.circleci/config.yml` se fijan a
  mano: sube la imagen de Node junto con `.nvmrc` y los Dockerfiles de producción.
- **Tipos de Node:** `@types/node` se queda en la versión mayor del runtime (24). Dependabot ignora
  sus versiones mayores; súbelas en el mismo PR que cambie `.nvmrc`, los Dockerfiles y la CI.
- **Expo:** actualiza un SDK a la vez con `npx expo install expo@^<siguiente> --fix` en cada app;
  las versiones de React y React Native siguen al SDK — nunca las subas por separado.
- **Versiones mayores** (Next, NestJS, TypeScript, ESLint): una por PR; lee las notas de la versión
  y corre la verificación completa de [local-setup.md](local-setup.md#5-verificar-todo).
- Revisa cada mes la salida de `pnpm audit --prod`. Las dependencias nuevas necesitan una breve
  justificación en el PR (primero intenta con la plataforma o la biblioteca estándar).
- pnpm bloquea por defecto los scripts de instalación de las dependencias; permite uno solo con
  `onlyBuiltDependencies` en `pnpm-workspace.yaml`, después de revisar lo que ejecuta.

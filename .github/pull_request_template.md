## Qué y por qué

<!-- ¿Qué hace este cambio y por qué hace falta? Enlaza el issue: Closes #123 -->

## Áreas afectadas

- [ ] `apps/web`
- [ ] `apps/passenger-mobile`
- [ ] `apps/transport-mobile`
- [ ] `apps/api`
- [ ] `packages/*`
- [ ] Infraestructura / CI / documentación

## Cómo se probó

<!-- Comandos ejecutados y su resultado, pruebas manuales, capturas para cambios de interfaz. -->

## Lista de verificación

- [ ] `pnpm check` pasa en local (lint, tipos, pruebas)
- [ ] Sin secretos, credenciales reales ni datos personales en código, fixtures, logs o capturas
- [ ] Las variables de entorno nuevas están en el `.env.example` correspondiente y en `docs/development/environment-variables.md`
- [ ] Los cambios de base de datos vienen como migración (nunca editando el SQL inicial)
- [ ] Los cambios de contratos en `packages/shared-types` son compatibles hacia atrás, o todos sus consumidores se actualizan en este PR
- [ ] Documentación actualizada donde cambió el comportamiento o los comandos (`CHANGELOG.md` en Sin publicar, `docs/roadmap.md` si cambió el estado de una funcionalidad)

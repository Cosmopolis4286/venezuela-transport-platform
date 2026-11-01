# Cómo contribuir

1. Lee el [README](README.md) y prepara tu computadora con
   [docs/development/local-setup.md](docs/development/local-setup.md). El
   [índice de la documentación](docs/README.md) reúne la arquitectura, las guías y las
   [pruebas](docs/development/testing.md).
2. Crea una rama desde `main` (`feat/...`, `fix/...`, `chore/...`) — ver
   [flujo del repositorio](docs/development/repository-workflow.md).
3. Haz cambios enfocados. Sigue las reglas de módulos y contratos de la
   [visión general de la arquitectura](docs/architecture/overview.md).
4. Antes de subir: `pnpm format && pnpm check` (y `pnpm build` si tocas configuración de
   compilación). Si cambia el comportamiento, agrega una línea en **Sin publicar** de
   [CHANGELOG.md](CHANGELOG.md) y actualiza [docs/roadmap.md](docs/roadmap.md) si una funcionalidad
   pasa de pendiente a lista.
5. Haz commits con [Conventional Commits](https://www.conventionalcommits.org/es/):
   `feat(api): add terminals module`.
6. Abre un pull request con la plantilla. La CI debe estar en verde antes de fusionar.

## Reglas básicas

- Nunca subas archivos `.env`, credenciales, certificados, datos reales de pasajeros ni copias de
  la base de producción.
- Agrega cada variable de entorno nueva al `.env.example` que corresponda y a
  [environment-variables.md](docs/development/environment-variables.md).
- Las variables expuestas en el móvil (`EXPO_PUBLIC_*`) y en el navegador (`NEXT_PUBLIC_*`) son
  públicas.
- No compartas componentes de interfaz entre la web y las apps móviles; comparte solo contratos
  con `@vtp/shared-types`.
- Agrega dependencias móviles con `npx expo install <paquete>` dentro de la carpeta de la app, para
  que las versiones coincidan con el SDK de Expo.
- Las dependencias nuevas necesitan una justificación en la descripción del PR.
- Si cambias lo que ve un usuario, actualiza su guía en `docs/guides/`; si agregas o cambias una
  tabla, el [modelo de datos](docs/architecture/data-model.md).

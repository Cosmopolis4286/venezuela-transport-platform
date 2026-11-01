# Documentación de VTP

Por dónde empezar según lo que necesites.

## Para usar la plataforma

- [Guía del pasajero](guides/pasajeros.md): comprar, pagar, cancelar, pedir un taxi.
- [Guía para empresas](guides/empresas.md): portal, rutas, despacho, taxis, liquidaciones.
- [Guía para conductores e inspectores](guides/conductores.md): app de transportistas.
- [Manual de administración](guides/administracion.md): revisiones, políticas, pagos a empresas,
  reembolsos.
- [Glosario](glossary.md).

## Estado y decisiones

- [Progreso y hoja de ruta](roadmap.md): qué funciona, qué sigue, decisiones pendientes.
- [Decisiones de arquitectura (ADR)](architecture/decisions.md).
- [Registro de cambios](../CHANGELOG.md).

## Arquitectura

- [Visión general](architecture/overview.md) · [Modelo de datos](architecture/data-model.md)
- [Autenticación](architecture/authentication.md) ·
  [Organizaciones y roles](architecture/organizations.md) ·
  [Solicitudes KYC](architecture/onboarding.md)
- [Red: paradas, rutas, tarifas, horarios](architecture/network.md) ·
  [Flota: mapas de puestos y vehículos](architecture/fleet.md)
- [Reservas](architecture/bookings.md) · [Pagos y boletos](architecture/payments.md) ·
  [Liquidaciones y reembolsos](architecture/settlements.md)
- [Despacho](architecture/dispatch.md) · [Taxis](architecture/taxis.md) ·
  [Notificaciones](architecture/notifications.md)
- [Portal web](architecture/web-portal.md) · [Apps móviles](architecture/mobile-apps.md) ·
  [Idiomas](architecture/i18n.md)

## Desarrollo

- [Instalación local](development/local-setup.md) · [Docker](development/docker.md) ·
  [Variables de entorno](development/environment-variables.md)
- [Pruebas](development/testing.md) · [Probar en Android](development/android-testing.md)
- [Flujo del repositorio](development/repository-workflow.md) ·
  [Runner de CI propio](development/self-hosted-runner.md)

## Despliegue

- [Preparación del VPS](deployment/vps-preparation.md)

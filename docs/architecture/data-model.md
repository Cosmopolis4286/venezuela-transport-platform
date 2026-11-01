# Modelo de datos

Todas las tablas viven en PostgreSQL 18 + PostGIS. Cada módulo de la API es dueño de las suyas
(`apps/api/src/modules/<módulo>/<módulo>.schema.ts`, reunidas en `src/database/schema.ts`) y
los demás módulos solo las leen o las cambian a través de su servicio, salvo las lecturas para
reportes y avisos. Las migraciones están en `apps/api/drizzle/` (ver
[ADR-007](decisions.md#adr-007-drizzle-orm-con-migraciones-sql-versionadas)): nunca se edita una ya
aplicada.

Convenciones: ids `uuid` aleatorios; fechas como `timestamptz` (la hora de Venezuela se calcula al
mostrarlas, con `toNetworkIso`); montos `numeric` con dos decimales, nunca `float`; enums de
PostgreSQL generados desde las listas de `@vtp/shared-types`.

## Por módulo

| Módulo          | Tabla                            | Qué guarda                                                                                                     |
| --------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `identity`      | `users`                          | Personas: correo y teléfono (únicos, con su verificación), nombre, hash de la contraseña, rol de plataforma    |
|                 | `sessions`                       | Sesiones por app (`passenger`, `transport`, `web`) con los tokens guardados como hash y su rotación            |
|                 | `otp_challenges`                 | Códigos de un solo uso (hash, intentos, vencimiento)                                                           |
| `audit`         | `audit_events`                   | Quién hizo qué y cuándo (solo ids y metadatos no sensibles)                                                    |
| `organizations` | `organizations`                  | Empresas de autobuses, líneas de taxis y terminales; RIF, estado de la revisión                                |
|                 | `organization_memberships`       | Persona + organización + rol                                                                                   |
|                 | `organization_invitations`       | Invitaciones por correo o teléfono, con vencimiento                                                            |
| `onboarding`    | `provider_applications`          | Solicitudes KYC de conductores y personal                                                                      |
|                 | `provider_application_documents` | Documentos de cada solicitud (archivo en `FileStorage`, veredicto)                                             |
| `network`       | `stops`                          | Catálogo de terminales y paradas (con ubicación PostGIS)                                                       |
|                 | `routes`, `route_stops`          | Rutas de cada empresa y sus paradas en orden, con el tiempo desde el origen                                    |
|                 | `route_fares`                    | Tarifa por par de paradas (USD o VES)                                                                          |
|                 | `route_schedules`                | Horarios semanales con su vigencia, clase de servicio y mapa de puestos                                        |
| `fleet`         | `seat_layouts`                   | Mapas de puestos por tipo de vehículo                                                                          |
|                 | `vehicles`                       | Vehículos de cada empresa (placa, mapa de puestos, activo)                                                     |
|                 | `vehicle_documents`              | Certificado de circulación, póliza y permiso de cada vehículo, con su vencimiento                              |
| `bookings`      | `trips`                          | Un horario en una fecha; se crea con la primera reserva o al asignar vehículo y conductor                      |
|                 | `bookings`                       | Reservas: tramo, montos congelados, estado (`held`, `confirmed`, `cancelled`, `expired`), recordatorio enviado |
|                 | `booking_passengers`             | Un puesto por fila; un índice parcial único impide vender un puesto dos veces; abordaje                        |
| `payments`      | `exchange_rates`                 | Tasas de cambio de cada empresa                                                                                |
|                 | `payments`                       | Intentos de pago con monto y tasa congelados, referencia, estado y reembolso                                   |
| `settlements`   | `platform_settings`              | La política general (una sola fila): comisión y tramos de reembolso                                            |
|                 | `organization_policies`          | La política propia de una empresa (lo que deja vacío usa la general)                                           |
|                 | `settlement_entries`             | Libro de cada empresa: una fila al pagarse una reserva y otra (negativa) si se cancela                         |
|                 | `payouts`                        | Pagos de la plataforma a las empresas (se anulan, no se borran)                                                |
| `taxi`          | `taxi_service_areas`             | Terminales donde opera cada línea de taxis                                                                     |
|                 | `taxi_rides`                     | Solicitudes y viajes de taxi; índices parciales únicos: un taxi abierto por pasajero, un viaje por conductor   |
| `reports`       | —                                | No tiene tablas: lee el libro, las salidas y la actividad ([reports.md](reports.md))                           |
| `notifications` | `push_devices`                   | Tokens de Expo por teléfono, con la app y el idioma                                                            |
|                 | `notifications`                  | Registro de lo enviado (tipo, canal, estado, referencia), sin el texto                                         |

## Relaciones principales

```
users ─┬─< organization_memberships >── organizations ─┬─< routes ─┬─< route_stops >── stops
       │                                               │           ├─< route_fares
       │                                               │           └─< route_schedules ──> seat_layouts
       │                                               ├─< vehicles
       │                                               ├─< exchange_rates
       │                                               ├── organization_policies
       │                                               ├─< settlement_entries ──> bookings
       │                                               └─< payouts
       ├─< bookings ──> trips ──> route_schedules
       │      ├─< booking_passengers
       │      └─< payments
       ├─< taxi_rides ──> stops (terminal)
       ├─< push_devices
       └─< sessions, otp_challenges, notifications, provider_applications
```

## Garantías en la base de datos

Las reglas que no pueden fallar con solicitudes simultáneas las impone PostgreSQL, no el código:

- un puesto activo por viaje (`booking_passengers_active_seat_key`);
- un pago pendiente por reserva (`payments_booking_pending_key`) y referencias de pago únicas;
- un taxi abierto por pasajero, un viaje activo por conductor y por vehículo;
- una fila del libro por reserva y tipo (`settlement_entries_booking_kind_key`);
- una sola fila de política general (`platform_settings_single_row`);
- un token de push por dispositivo (`push_devices_token_key`).

Las demás carreras (asignar el mismo conductor a dos viajes, pagar más que el saldo) se ordenan con
bloqueos de fila o `pg_advisory_xact_lock` dentro de una transacción.

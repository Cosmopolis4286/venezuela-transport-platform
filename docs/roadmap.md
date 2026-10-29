# Progreso y hoja de ruta

Qué hace hoy la plataforma, qué viene después y qué falta. Se actualiza con cada pull request que
lo cambia; el historial de cambios está en el [CHANGELOG](../CHANGELOG.md).

**Estado (2026-10-28): en desarrollo, sin desplegar.** El flujo completo de venta de boletos
funciona de punta a punta con un proveedor de pagos simulado. Nada está listo todavía para
usuarios reales ni dinero real; ver [Antes de producción](#antes-de-producción).

Leyenda: ✅ listo · 🟡 parcial · ⏭️ siguiente · ⬜ pendiente

## Por usuario

| Quién                                                   | Puede hacer hoy                                                                                                                                                                                                                                                                                                                    | Le falta                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Pasajero** (app, web)                                 | Buscar salidas (sin cuenta), elegir puestos en el mapa del bus, apartarlos 15 min, pagar (simulado) por pago móvil, transferencia, PIX o USDT, mostrar un boleto QR por puesto, "Mis viajes", pedir un taxi desde o hacia un terminal                                                                                              | Pagos reales, reembolsos y cancelar un viaje pagado, notificaciones, pagar el taxi en la app |
| **Empresa de autobuses / línea de taxis** (portal)      | Registrarse y ser aprobada, invitar personal con roles, aceptar solicitantes verificados, publicar rutas, tarifas, horarios y mapas de puestos, fijar tasas de cambio, ver viajes y listas de pasajeros, registrar vehículos, asignar vehículo y conductor a cada salida, elegir los terminales de sus taxis y asignar solicitudes | Liquidaciones (lo que la plataforma le debe), reportes                                       |
| **Inspector** (app de transportistas)                   | Escanear boletos al abordar (cámara o código + puesto), ver quién abordó en la lista de pasajeros                                                                                                                                                                                                                                  | Escaneo sin conexión                                                                         |
| **Conductor / personal** (app de transportistas)        | Iniciar sesión, aceptar invitaciones, enviar la solicitud con documentos KYC, ver sus viajes asignados y quién viaja, tomar solicitudes de taxi y llevarlas hasta el final                                                                                                                                                         | Avisos de viajes nuevos, marcar salida y llegada, ubicación en vivo                          |
| **Personal de la plataforma** (panel de administración) | Aprobar organizaciones y solicitudes KYC, administrar el catálogo de paradas                                                                                                                                                                                                                                                       | Pagos por reembolsar, liquidaciones, métricas                                                |

## Por área

| Área                             | Estado | Notas                                                                                                                                                                                                            |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base del proyecto                | ✅     | Monorepo, Docker Compose (PostgreSQL + PostGIS, y modos híbrido y completo), OpenAPI, lint, pruebas, imágenes de producción, CircleCI y un runner propio                                                         |
| Cuentas e inicio de sesión       | 🟡     | Funcionan correo + contraseña y los códigos de un solo uso. **Los códigos solo se imprimen en el log**: todavía no hay proveedor de SMS / WhatsApp / correo ([authentication](architecture/authentication.md))   |
| Organizaciones y roles           | ✅     | Empresas de autobuses, líneas de taxis, terminales; seis roles y una matriz de permisos; invitaciones; revisión de la plataforma ([organizations](architecture/organizations.md))                                |
| KYC de conductores y personal    | ✅     | Solicitudes, documentos, revisión de la plataforma, aceptación de la organización ([onboarding](architecture/onboarding.md))                                                                                     |
| Red de transporte                | ✅     | Paradas, rutas, tarifas por par de paradas, horarios semanales, búsqueda de salidas ([network](architecture/network.md))                                                                                         |
| Mapas de puestos                 | ✅     | Editor con plantillas; los horarios toman su capacidad del mapa ([fleet](architecture/fleet.md))                                                                                                                 |
| Reservas                         | ✅     | Puestos apartados en el mapa del bus, sin doble venta, listas de pasajeros ([bookings](architecture/bookings.md))                                                                                                |
| Pagos                            | 🟡     | Tasas de cambio, cuatro métodos, confirmación automática mediante adaptadores — **solo con el proveedor simulado** ([payments](architecture/payments.md))                                                        |
| Boletos y abordaje               | ✅     | Un QR por puesto, escáner en la app de transportistas, hora de abordaje en la lista de pasajeros                                                                                                                 |
| Liquidaciones y comisión         | ⏭️     | Esperando la decisión sobre la comisión (ver [Decisiones pendientes](#decisiones-pendientes))                                                                                                                    |
| Reembolsos                       | ⬜     | Los pagos quedan marcados `refund_due`; todavía no hay pantalla ni proceso para devolverlos                                                                                                                      |
| Despacho de taxis                | ✅     | Solicitudes en los terminales; la primera línea que la toma fija la tarifa; ciclo de vida completo; un viaje a la vez por conductor y vehículo ([taxis](architecture/taxis.md)). El pago es directo al conductor |
| Vehículos y asignación de viajes | ✅     | Placas y mapa de puestos por vehículo, tablero de despacho del día, sin cruces de horario, viajes del conductor en la app ([dispatch](architecture/dispatch.md)); faltan los documentos de los vehículos         |
| Notificaciones                   | ⬜     | SMS / WhatsApp / correo / push (códigos, confirmación de pago, recordatorios de viaje)                                                                                                                           |
| Reportes                         | ⬜     | Ventas y ocupación para las empresas; métricas para la plataforma                                                                                                                                                |
| Despliegue                       | ⬜     | Preparación documentada ([VPS](deployment/vps-preparation.md)); nada desplegado                                                                                                                                  |

## Próximos pasos

En orden; cada uno es un pull request.

1. ⏭️ **Liquidaciones (paso 4 del ADR-018).** Un registro de lo que la plataforma le debe a cada
   empresa por cada reserva pagada (tarifa menos comisión), el saldo de la empresa en el portal,
   el registro de los pagos hechos y una lista para la administración con los pagos `refund_due`
   por atender.
2. **Reembolsos y cancelación de reservas pagadas**, con la política que fije el dueño del
   producto (plazo, penalidad).
3. **Notificaciones**: primero un proveedor real para los códigos de acceso (bloquea producción),
   luego la confirmación de pago y los recordatorios de viaje.
4. **Reportes** para las empresas y métricas de la plataforma.

## Pendientes menores

- Reservas: que la empresa cancele un viaje (y reembolse a sus pasajeros); revender un puesto
  liberado en una parada intermedia.
- Red: excepciones a los horarios (feriados, salidas canceladas sueltas), andenes dentro de los
  terminales, estado en tiempo real.
- Boletos: validación sin conexión (QR firmados y sincronización de abordajes).
- Móvil: selector de fecha nativo; texto en español para todos los mensajes de validación de la
  API; notificaciones push en vez de deslizar para actualizar.
- Pagos: limpieza periódica de los apartados vencidos (hoy se liberan al vuelo).
- Taxis: cobro dentro de la plataforma, tarifas fijas por zona, ubicación en vivo, avisos push,
  calificaciones.
- Despacho: documentos de los vehículos con vencimiento; aviso al conductor cuando le asignan un
  viaje; que el conductor marque la salida y la llegada.

## Decisiones pendientes

| Decisión                                                                                             | Se necesita para             |
| ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| Comisión de la plataforma: porcentaje, y si es la misma para todas las empresas                      | Liquidaciones (próximo paso) |
| Cada cuánto se les paga a las empresas, y cómo (transferencia, pago móvil, USDT)                     | Liquidaciones                |
| Política de reembolso: hasta cuándo puede cancelar un pasajero, y si se cobra una penalidad          | Reembolsos                   |
| Taxis: ¿se cobran dentro de la plataforma (y con qué comisión) o se siguen pagando al conductor?     | Pagos de taxis               |
| Proveedores de pago a contratar: banco o pasarela para pago móvil y transferencias, PIX, red de USDT | Pagos reales                 |
| Proveedor de SMS / WhatsApp / correo para los códigos de acceso                                      | Producción                   |

## Antes de producción

Nada de esto está hecho todavía:

- [ ] Revisión legal: cobrar dinero por cuenta de terceros y aceptar criptomonedas en Venezuela y
      Brasil (ADR-018).
- [ ] Adaptadores de proveedores de pago reales, con sus claves en la configuración del servidor
      (`PAYMENT_PROVIDER=disabled` mientras tanto).
- [ ] Un proveedor real para enviar los códigos de acceso (hoy `OTP_DELIVERY` es `console` o
      `disabled`).
- [ ] Liquidaciones y un proceso de reembolsos, para llevar la cuenta del dinero que se les debe a
      empresas y pasajeros.
- [ ] Servidor, HTTPS, copias de seguridad con restauración probada, monitoreo
      ([preparación del VPS](deployment/vps-preparation.md)).
- [ ] Apps móviles firmadas y publicadas (EAS) con la URL de la API de producción.
- [ ] Aviso de privacidad y términos de uso (se guardan números de cédula de los pasajeros).

# Progreso y hoja de ruta

Qué hace hoy la plataforma, qué viene después y qué falta. Se actualiza con cada pull request que
lo cambia; el historial de cambios está en el [CHANGELOG](../CHANGELOG.md).

**Estado (2026-10-29): en desarrollo, sin desplegar.** Funcionan de punta a punta, con un
proveedor de pagos simulado:

- la venta de boletos: búsqueda, puestos en el mapa, pago, QR y abordaje;
- la operación de las empresas: vehículos, y vehículo y conductor por salida;
- los taxis desde y hacia los terminales.

Nada está listo todavía para usuarios reales ni dinero real; ver
[Antes de producción](#antes-de-producción). Lo que necesita una decisión del dueño del producto
está en [Decisiones pendientes](#decisiones-pendientes).

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

Ordenadas por lo que bloquean. La recomendación es un punto de partida, no una decisión.

### Negocio y dinero

| Decisión                                                                                                                                                 | Bloquea                             | Recomendación                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Comisión de la plataforma** sobre los boletos: porcentaje, y si es la misma para todas las empresas                                                    | Liquidaciones (próximo paso)        | Un porcentaje por empresa con un valor por defecto global: permite negociar con las empresas grandes sin cambiar código |
| **Pago a las empresas**: cada cuánto (diario, semanal) y por qué medio (transferencia, pago móvil, USDT)                                                 | Liquidaciones                       | Semanal y por transferencia en bolívares al principio; el saldo se calcula igual sea cual sea la frecuencia             |
| **Política de reembolsos**: hasta cuándo puede cancelar un pasajero un viaje pagado, y con qué penalidad                                                 | Reembolsos                          | Reembolso completo hasta 24 h antes, 50 % hasta 2 h antes, nada después; en la misma moneda en que pagó                 |
| **Cobro de los taxis**: ¿la plataforma cobra el taxi (y con qué comisión) o se sigue pagando al conductor?                                               | Pagos de taxis                      | Seguir con pago directo hasta tener liquidaciones; después ofrecer el cobro en la app como opción                       |
| **Tarifa del taxi**: ¿la escribe la línea al tomar el viaje (hoy), o hay tarifas fijas por zona? ¿El pasajero debe aceptarla antes de que salga el taxi? | Confianza del pasajero en los taxis | Tarifas fijas por zona publicadas por cada línea, y que el pasajero confirme la tarifa antes de que el taxi salga       |
| **Proveedores de pago** a contratar: banco o pasarela para pago móvil y transferencias, institución PIX, red de USDT                                     | Pagos reales                        | Empezar con un solo banco para pago móvil (lo más usado en Venezuela) y sumar los demás después                         |
| **Revisión legal**: cobrar por cuenta de terceros y aceptar criptomonedas en Venezuela y Brasil (ADR-018)                                                | Producción                          | Hacerla antes de contratar proveedores de pago                                                                          |

### Operación y producto

| Decisión                                                                                                        | Bloquea                     | Recomendación                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Proveedor de SMS / WhatsApp / correo** para los códigos de acceso                                             | Producción                  | WhatsApp primero (más barato y usado en Venezuela), con SMS de respaldo                         |
| **Nombres de las apps y de los paquetes de Android** (por ejemplo `ve.vtp.pasajeros`) y la cuenta de Expo (EAS) | APK de prueba y las tiendas | Decidirlos ya: cambiar un nombre de paquete después de publicar obliga a publicar una app nueva |
| **Servidor y dominio** para la API y la web (VPS, proveedor, dominio `.com.ve` o `.com`)                        | Despliegue y APK de release | Un VPS pequeño con Caddy, como describe la [preparación del VPS](deployment/vps-preparation.md) |
| **Aviso de privacidad y términos de uso** (se guardan cédulas de pasajeros y datos KYC)                         | Producción                  | Redactarlos con un abogado junto con la revisión legal                                          |

### Valores por defecto para confirmar

Hoy funcionan con estos valores; cambiarlos es sencillo, pero conviene confirmarlos:

| Valor                                                           | Hoy                    | Dónde se cambia                        |
| --------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| Minutos que un puesto queda apartado esperando el pago          | 15                     | `BOOKING_HOLD_MINUTES` (configuración) |
| Puestos por reserva / apartados sin pagar por persona           | 6 / 3                  | Código (`bookings`)                    |
| Ventana para abordar con un boleto                              | ±12 horas de la salida | Código (`tickets`)                     |
| Minutos que espera una solicitud de taxi                        | 20                     | Código (`TAXI_REQUEST_MINUTES`)        |
| Pasajeros por taxi                                              | hasta 6                | Código (`MAX_TAXI_PASSENGERS`)         |
| Monedas de las tarifas de buses y taxis                         | US$ y Bs.              | Código (`CURRENCIES`)                  |
| Un puesto se ocupa durante todo el viaje, sea cual sea el tramo | sí                     | Código (reventa por tramo: pendiente)  |

### Técnicas (para el mantenedor)

| Decisión                                                                                                                  | Recomendación                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **PR #33** junta documentación, CI, Docker, vehículos y taxis (unas 15 000 líneas). ¿Fusionarlo entero o dividirlo?       | Fusionarlo entero cuando el runner propio lo pase en verde: todo se verificó junto, y dividirlo ahora cuesta más de lo que aporta |
| **Actualizaciones mayores de Dependabot**: #30 (`@eslint/js` 10), #31 (`vitest` 5), #32 (`typescript-eslint` 8.72)        | Una por una después de fusionar #33, corriendo `pnpm check` completo en cada una                                                  |
| **CI**: seguir con el runner en la PC (gratis, pero solo corre con la PC encendida) o volver a pagar créditos de CircleCI | Runner propio mientras no haya despliegue; créditos (o un runner en el VPS) cuando haya producción                                |

## Riesgos y deuda técnica

Lo que hoy funciona pero conviene corregir antes de crecer:

- **Errores identificados por su texto.** Varias acciones del portal traducen los conflictos
  (`409`) buscando palabras del mensaje en inglés de la API (vehículos, despacho, taxis). Un
  cambio de redacción en la API rompe la traducción sin que falle ninguna prueba. Solución: códigos
  de error estables por caso (por ejemplo `TAXI_RIDE_TAKEN`) en `API_ERROR_CODES`.
- **Zona horaria repetida.** El desfase de Venezuela (`-04:00`) está escrito en una docena de
  lugares. Venezuela no cambia de hora hoy, pero lo cambió en 2016; conviene una sola función
  compartida.
- **Código repetido.** La lista de roles que conducen está en dos servicios (`dispatch`, `taxi`),
  y la normalización de placas existe dos veces (`onboarding` y `shared-types`).
- **Sin pruebas de navegador en la CI.** Los flujos del portal y de las apps se probaron en
  Chromium con guiones manuales; la CI solo corre pruebas unitarias, e2e de la API y
  compilaciones. Una batería mínima con Playwright evitaría regresiones en las pantallas.
- **Consultas periódicas.** Las apps consultan cada 5 segundos (pagos y taxis) y el tablero de
  taxis cada 10. Sirve para empezar; con muchos usuarios conviene notificaciones push o WebSockets.
- **Vencimientos al leer.** Los apartados y las solicitudes de taxi vencidos se marcan cuando
  alguien lee o escribe, no con una tarea programada. Es correcto, pero los reportes podrían ver
  estados viejos.
- **El selector de terminales del portal** muestra todos los terminales en una lista; con cientos
  de terminales hará falta una búsqueda.
- **La CI depende de una PC personal**: si está apagada, los checks quedan en cola y nada se puede
  fusionar con las reglas de protección de `main`.

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

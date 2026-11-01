# Progreso y hoja de ruta

Qué hace hoy la plataforma, qué viene después y qué falta. Se actualiza con cada pull request que
lo cambia; el historial de cambios está en el [CHANGELOG](../CHANGELOG.md).

**Estado (2026-10-31): en desarrollo, sin desplegar.** Funcionan de punta a punta, con un
proveedor de pagos simulado:

- la venta de boletos: búsqueda, puestos en el mapa, pago, QR y abordaje;
- la operación de las empresas: vehículos, y vehículo y conductor por salida;
- el dinero: lo que gana cada empresa por reserva pagada, los pagos que le hace la plataforma y
  los reembolsos a los pasajeros;
- los taxis desde y hacia los terminales;
- para el pasajero, en español, inglés y portugués de Brasil.

Nada está listo todavía para usuarios reales ni dinero real; ver
[Antes de producción](#antes-de-producción). Lo que necesita una decisión del dueño del producto
está en [Decisiones pendientes](#decisiones-pendientes).

Leyenda: ✅ listo · 🟡 parcial · ⏭️ siguiente · ⬜ pendiente

## Por usuario

| Quién                                                   | Puede hacer hoy                                                                                                                                                                                                                                                                                                                    | Le falta                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Pasajero** (app, web)                                 | Buscar salidas (sin cuenta), elegir puestos en el mapa del bus, apartarlos 15 min, pagar (simulado) por pago móvil, transferencia, PIX o USDT, mostrar un boleto QR por puesto, "Mis viajes", pedir un taxi desde o hacia un terminal                                                                                              | Pagos reales, pagar el taxi en la app                               |
| **Empresa de autobuses / línea de taxis** (portal)      | Registrarse y ser aprobada, invitar personal con roles, aceptar solicitantes verificados, publicar rutas, tarifas, horarios y mapas de puestos, fijar tasas de cambio, ver viajes y listas de pasajeros, registrar vehículos, asignar vehículo y conductor a cada salida, elegir los terminales de sus taxis y asignar solicitudes | Reportes                                                            |
| **Inspector** (app de transportistas)                   | Escanear boletos al abordar (cámara o código + puesto), ver quién abordó en la lista de pasajeros                                                                                                                                                                                                                                  | Escaneo sin conexión                                                |
| **Conductor / personal** (app de transportistas)        | Iniciar sesión, aceptar invitaciones, enviar la solicitud con documentos KYC, ver sus viajes asignados y quién viaja, tomar solicitudes de taxi y llevarlas hasta el final                                                                                                                                                         | Avisos de viajes nuevos, marcar salida y llegada, ubicación en vivo |
| **Personal de la plataforma** (panel de administración) | Aprobar organizaciones y solicitudes KYC, administrar el catálogo de paradas                                                                                                                                                                                                                                                       | Métricas                                                            |

## Por área

| Área                             | Estado | Notas                                                                                                                                                                                                                                            |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base del proyecto                | ✅     | Monorepo, Docker Compose (PostgreSQL + PostGIS, y modos híbrido y completo), OpenAPI, lint, pruebas, imágenes de producción, CI en GitHub Actions (repositorio público)                                                                          |
| Cuentas e inicio de sesión       | 🟡     | Funcionan correo + contraseña y los códigos de un solo uso. **Los códigos solo se imprimen en el log**: todavía no hay proveedor de SMS / WhatsApp / correo ([authentication](architecture/authentication.md))                                   |
| Organizaciones y roles           | ✅     | Empresas de autobuses, líneas de taxis, terminales; seis roles y una matriz de permisos; invitaciones; revisión de la plataforma ([organizations](architecture/organizations.md))                                                                |
| KYC de conductores y personal    | ✅     | Solicitudes, documentos, revisión de la plataforma, aceptación de la organización ([onboarding](architecture/onboarding.md))                                                                                                                     |
| Red de transporte                | ✅     | Paradas, rutas, tarifas por par de paradas, horarios semanales, búsqueda de salidas ([network](architecture/network.md))                                                                                                                         |
| Mapas de puestos                 | ✅     | Editor con plantillas; los horarios toman su capacidad del mapa ([fleet](architecture/fleet.md))                                                                                                                                                 |
| Reservas                         | ✅     | Puestos apartados en el mapa del bus, sin doble venta, listas de pasajeros ([bookings](architecture/bookings.md))                                                                                                                                |
| Pagos                            | 🟡     | Tasas de cambio, cuatro métodos, confirmación automática mediante adaptadores — **solo con el proveedor simulado** ([payments](architecture/payments.md))                                                                                        |
| Boletos y abordaje               | ✅     | Un QR por puesto, escáner en la app de transportistas, hora de abordaje en la lista de pasajeros                                                                                                                                                 |
| Liquidaciones y comisión         | ✅     | Lo que gana cada empresa por reserva pagada, en la moneda de la tarifa; comisión por defecto (0 % hasta que se decida) y por empresa; pagos a las empresas; saldo en el portal ([settlements](architecture/settlements.md))                      |
| Reembolsos                       | ✅     | El pasajero cancela un viaje pagado y ve antes cuánto se le devuelve; política editable en general y por empresa (8 %; 100 % hasta 48 h, 50 % hasta 2 h); cola de reembolsos para la administración ([settlements](architecture/settlements.md)) |
| Despacho de taxis                | ✅     | Solicitudes en los terminales; la primera línea que la toma fija la tarifa; ciclo de vida completo; un viaje a la vez por conductor y vehículo ([taxis](architecture/taxis.md)). El pago es directo al conductor                                 |
| Vehículos y asignación de viajes | ✅     | Placas y mapa de puestos por vehículo, tablero de despacho del día, sin cruces de horario, viajes del conductor en la app ([dispatch](architecture/dispatch.md)); faltan los documentos de los vehículos                                         |
| Notificaciones                   | 🟡     | Push (Expo) y correo (SMTP) sobre pagos, cancelaciones, reembolsos, recordatorios, viajes asignados y taxis; códigos por correo ([notifications](architecture/notifications.md)). Falta: proyecto de EAS para el push, proveedor de SMS/WhatsApp |
| Reportes                         | ⬜     | Ventas y ocupación para las empresas; métricas para la plataforma                                                                                                                                                                                |
| Idiomas                          | ✅     | Web pública y app de pasajeros en español, inglés y portugués de Brasil ([i18n](architecture/i18n.md)); portal y app de transportistas solo en español                                                                                           |
| Despliegue                       | ⬜     | Preparación documentada ([VPS](deployment/vps-preparation.md)); nada desplegado                                                                                                                                                                  |

## Próximos pasos

En orden; cada uno es un pull request.

1. ⏭️ **Reportes** para las empresas (ventas y ocupación por ruta y salida, exportar) y métricas
   de la plataforma.

## Pendientes menores

- Reservas: que la empresa cancele un viaje (y reembolse a sus pasajeros); revender un puesto
  liberado en una parada intermedia.
- Red: excepciones a los horarios (feriados, salidas canceladas sueltas), andenes dentro de los
  terminales, estado en tiempo real.
- Boletos: validación sin conexión (QR firmados y sincronización de abordajes).
- Móvil: selector de fecha nativo; texto en español para todos los mensajes de validación de la
  API; notificaciones push en vez de deslizar para actualizar.
- Pagos: limpieza periódica de los apartados vencidos (hoy se liberan al vuelo).
- Idiomas: traducir el portal y la app de transportistas si llegan empresas o conductores que no
  hablen español; mensajes de validación de la API en el idioma del usuario.
- Taxis: cobro dentro de la plataforma, tarifas fijas por zona, ubicación en vivo, avisos push,
  calificaciones.
- Despacho: documentos de los vehículos con vencimiento; aviso al conductor cuando le asignan un
  viaje; que el conductor marque la salida y la llegada.

## Decisiones pendientes

Ordenadas por lo que bloquean. La recomendación es un punto de partida, no una decisión.

### Negocio y dinero

| Decisión                                                                                                                                                 | Bloquea                             | Recomendación                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Pago a las empresas**: cada cuánto (diario, semanal) y por qué medio (transferencia, pago móvil, USDT)                                                 | Operación de las liquidaciones      | Semanal y por transferencia en bolívares al principio; el saldo se calcula igual sea cual sea la frecuencia       |
| **Cobro de los taxis**: ¿la plataforma cobra el taxi (y con qué comisión) o se sigue pagando al conductor?                                               | Pagos de taxis                      | Seguir con pago directo hasta tener liquidaciones; después ofrecer el cobro en la app como opción                 |
| **Tarifa del taxi**: ¿la escribe la línea al tomar el viaje (hoy), o hay tarifas fijas por zona? ¿El pasajero debe aceptarla antes de que salga el taxi? | Confianza del pasajero en los taxis | Tarifas fijas por zona publicadas por cada línea, y que el pasajero confirme la tarifa antes de que el taxi salga |
| **Proveedores de pago** a contratar: banco o pasarela para pago móvil y transferencias, institución PIX, red de USDT                                     | Pagos reales                        | Empezar con un solo banco para pago móvil (lo más usado en Venezuela) y sumar los demás después                   |
| **Revisión legal**: cobrar por cuenta de terceros y aceptar criptomonedas en Venezuela y Brasil (ADR-018)                                                | Producción                          | Hacerla antes de contratar proveedores de pago                                                                    |

### Operación y producto

| Decisión                                                                                                        | Bloquea                     | Recomendación                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Proveedor de correo** (SMTP) para los códigos de acceso y avisos: cuál contratar y desde qué dominio          | Producción                  | Cualquier SMTP con dominio propio verificado (SPF/DKIM); decidido: push en las apps + correo    |
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

Ninguna abierta. El PR #33 y las actualizaciones de Dependabot (#30–#38) ya están fusionados;
las nuevas se fusionan una por una cuando su CI pasa en verde.

## Riesgos y deuda técnica

Lo que hoy funciona pero conviene corregir antes de crecer:

- **Conflictos antiguos sin `reason`.** Las reservas, los pagos, los vehículos, el despacho y los
  taxis ya dicen por qué rechazan algo con un `reason` estable. Los conflictos de cuentas,
  organizaciones, invitaciones, solicitudes KYC, paradas y rutas todavía muestran el mensaje en
  inglés de la API en las apps móviles (el portal traduce los suyos). Agregarles un `reason` es
  trabajo mecánico.
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

Ya corregido: la CI corre en las máquinas de GitHub desde que el repositorio es público (2026-10-31).
También (2026-10-29): los errores del portal ya no se identifican por su texto en inglés,
sino por un `reason` estable que también traduce las apps móviles; la hora de Venezuela se
calcula en un solo lugar (`toNetworkIso`, `networkClock`); los roles que conducen y la
normalización de placas se comparten en vez de repetirse.

## Antes de producción

Nada de esto está hecho todavía:

- [ ] Revisión legal: cobrar dinero por cuenta de terceros y aceptar criptomonedas en Venezuela y
      Brasil (ADR-018).
- [ ] Adaptadores de proveedores de pago reales, con sus claves en la configuración del servidor
      (`PAYMENT_PROVIDER=disabled` mientras tanto).
- [x] Códigos de acceso y avisos por correo (ADR-026): falta contratar la cuenta SMTP con dominio
      propio y configurar `OTP_DELIVERY=email` y `MAIL_DELIVERY=smtp`.
- [ ] Proyecto de EAS (con los nombres de los paquetes) para activar el push (`PUSH_DELIVERY=expo`).
- [x] Liquidaciones y cola de reembolsos (ADR-024).
- [x] Comisión de la plataforma y política de reembolsos (ADR-025), editables en la web.
- [ ] Servidor, HTTPS, copias de seguridad con restauración probada, monitoreo
      ([preparación del VPS](deployment/vps-preparation.md)).
- [ ] Apps móviles firmadas y publicadas (EAS) con la URL de la API de producción.
- [ ] Aviso de privacidad y términos de uso (se guardan números de cédula de los pasajeros).

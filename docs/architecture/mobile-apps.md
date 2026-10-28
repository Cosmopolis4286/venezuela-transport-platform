# Apps móviles (Expo)

Dos apps separadas con interfaz en español, ambas con Expo SDK 58 + Expo Router (rutas en
`src/app/`):

- `apps/passenger-mobile` (_VTP Pasajeros_): búsqueda de viajes (sin cuenta), reserva de puestos,
  pago y boletos QR, inicio de sesión y cuenta.
- `apps/transport-mobile` (_VTP Transportistas_): conductores y personal de empresas de autobuses,
  líneas de taxis y terminales. Inicio de sesión, invitaciones, la solicitud KYC y el escáner de
  boletos.

El código que necesitan las dos apps está en `packages/mobile-core` (`@vtp/mobile-core`, ver
ADR-016). Los contratos vienen de `@vtp/shared-types`.

## Pantallas

| App            | Ruta                | Qué                                                                                                                       |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ambas          | `/sign-in`          | Código por SMS, WhatsApp o correo (crea la cuenta en el primer uso), o correo + contraseña                                |
| Ambas          | `/register`         | Crear una cuenta con correo + contraseña                                                                                  |
| Pasajeros      | `/`                 | Búsqueda de viajes: origen, destino (selector de paradas), fechas de los próximos 7 días; funciona sin sesión             |
| Pasajeros      | `/stop-picker`      | Búsqueda en ventana modal entre los terminales y paradas activos (`GET /stops?q=`)                                        |
| Pasajeros      | `/results`          | Salidas con horas (`+1 d` si llegan al día siguiente), duración, empresa, clase, puestos y tarifa                         |
| Pasajeros      | `/trip`             | Mapa de puestos de una salida: puestos ocupados deshabilitados, hasta 6 puestos, precio; público hasta apartar            |
| Pasajeros      | `/passengers`       | Con sesión: nombre y documento por puesto (el primero se llena con la cuenta), luego apartar los puestos                  |
| Pasajeros      | `/booking/:id`      | Código de reserva, estado, cuenta regresiva del apartado; pagar (método, instrucciones, referencia); boleto QR por puesto |
| Pasajeros      | `/bookings`         | "Mis viajes": las reservas del usuario, de la más reciente a la más antigua                                               |
| Pasajeros      | `/account`          | Solo con sesión: cuenta y contactos verificados, "Mis viajes", cerrar sesión                                              |
| Transportistas | `/`                 | Invitaciones pendientes (aceptar / rechazar), mis organizaciones y roles, estado de mi solicitud                          |
| Transportistas | `/application`      | Datos de la solicitud, documentos requeridos con carga y veredictos de la revisión, enviar a revisión                     |
| Transportistas | `/application/edit` | Rol, organización (buscada en el directorio), datos personales, vehículo para taxistas                                    |
| Transportistas | `/scan`             | "Validar boletos" (`tickets.validate`): escaneo del QR con la cámara o código de reserva + puesto; veredicto al instante  |

La navegación sigue el estado de la sesión: `Stack.Protected` en cada layout raíz muestra las
pantallas con sesión solo cuando hay sesión, y las de inicio de sesión solo cuando no la hay, así
que ninguna pantalla decide a dónde ir después de iniciar o cerrar sesión. Las pantallas de
búsqueda de pasajeros quedan fuera de ambas protecciones: la búsqueda es pública, y
`useApi(path, { auth: false })` la llama sin sesión.

## Manejo de la sesión (`@vtp/mobile-core`)

- `ApiClient` inicia sesión con `client: 'passenger'` o `client: 'transport'`; las sesiones nunca
  se comparten entre apps.
- `secureTokenStore()` guarda los tokens en el Keychain de iOS / Android Keystore, legibles solo
  con el dispositivo desbloqueado y sin restaurarse en otro dispositivo desde una copia de
  seguridad.
- El token de acceso se renueva 30 segundos antes de vencer. Los tokens de renovación rotan y la
  API revoca la sesión cuando se reutiliza uno viejo, así que las solicitudes simultáneas
  comparten **una** renovación en curso, y los tokens rotados se guardan antes de que cualquier
  solicitud los use. Un 401 provoca una renovación y un reintento; si la renovación se rechaza, la
  sesión termina y la app vuelve al inicio de sesión con un aviso. Los errores de red y los 5xx
  conservan la sesión.
- `AuthProvider` restaura la sesión guardada al abrir la app. Si no se puede llegar a la API,
  muestra una pantalla para reintentar en lugar de cerrar la sesión.
- Los errores se muestran en español con `ApiError.userMessage` (los mismos textos que el portal
  web).

## Validación de boletos (app de transportistas)

Los miembros con `tickets.validate` (dueño, administrador, inspector) de una organización activa
ven **Validar boletos** en la pantalla de inicio. La cámara lee el QR del pasajero (`expo-camera`,
cámara trasera, solo códigos QR; si vuelve a leer el mismo código en menos de 4 segundos, lo
ignora), o el inspector escribe el código de reserva y el puesto. El resultado aparece al instante:
verde "puede abordar", ámbar "ya se usó" con la hora de abordaje, o rojo para boletos sin pagar y
de otras salidas (ver [payments.md](payments.md#boletos)). El texto del permiso de cámara está en
`app.json`; no se pide el micrófono.

## Solicitud KYC (app de transportistas)

1. El usuario elige el rol y, si quiere, la organización: `GET /organizations/directory` lista las
   organizaciones activas, filtradas en la app a las que tienen el rol elegido.
2. Datos personales y, para los taxistas con vehículo propio, el vehículo.
3. Documentos: `requiredDocuments(role, providesVehicle)` de los contratos decide cuáles. Cada uno
   se elige con `expo-document-picker` (JPG, PNG o PDF) y se sube como multipart a
   `PUT /me/application/documents/:kind`, con su fecha de vencimiento si la tiene. La API verifica
   el tipo real por el contenido y el límite de 10 MB.
4. **Enviar a revisión** cuando no falta nada. Las notas de la revisión, los documentos rechazados
   y la decisión final (incluida la respuesta de la organización) se muestran en la pantalla de la
   solicitud.

## Vista previa en el navegador

`app.json` incluye la plataforma `web` para que las dos apps se puedan abrir en un navegador
(`pnpm --filter @vtp/passenger-mobile dev --web`, `pnpm --filter @vtp/transport-mobile dev --web`)
y revisar pantallas sin emulador. Es una ayuda de desarrollo, no un producto:

- En el navegador no hay almacenamiento seguro, así que la sesión vive en memoria y recargar la
  página la cierra. Los tokens nunca se escriben en `localStorage`.
- La API debe permitir el origen: `CORS_ORIGINS` en `apps/api/.env.example` ya incluye
  `http://localhost:8081` y `http://localhost:8082`.
- En la web, `expo-camera` decodifica los códigos QR con `zxing-wasm`, que se descarga de jsDelivr
  la primera vez; los teléfonos usan el escáner nativo. Sin internet, escribe el código de reserva
  y el puesto.

## Limitaciones conocidas

- Los mensajes de validación de la API están en inglés. Las pantallas reemplazan los más comunes
  (archivo rechazado, documentos faltantes) por texto en español; traducir los mensajes de la API
  queda pendiente.
- Las fechas se escriben como `AAAA-MM-DD`; un selector de fecha nativo puede reemplazarlo más
  adelante.
- Todavía no hay notificaciones push: el usuario desliza hacia abajo para ver los resultados de la
  revisión.

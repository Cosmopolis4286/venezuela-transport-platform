# Portal web (Next.js)

`apps/web`: el sitio público, el **portal de las organizaciones** (`/portal`) y el **panel de
administración de la plataforma** (`/admin`). Interfaz en español. Todos los datos vienen de la
API; el servidor web nunca toca la base de datos.

## Pantallas

| Ruta                                               | Quién                            | Qué                                                                                                                                                                        |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/es`, `/es/buscar` (y `/en`, `/pt-br`)            | Cualquiera                       | Búsqueda de viajes en español, inglés o portugués ([idiomas](i18n.md)): origen, destino y fecha; salidas con horas, empresa, clase, tarifa y puestos libres                |
| `/login`                                           | Cualquiera                       | Iniciar sesión con un código (SMS / WhatsApp / correo) o con correo + contraseña                                                                                           |
| `/register`                                        | Cualquiera                       | Crear una cuenta con correo + contraseña                                                                                                                                   |
| `/portal`                                          | Con sesión                       | Mis organizaciones, invitaciones pendientes (aceptar / rechazar)                                                                                                           |
| `/portal/organizations/new`                        | Con sesión                       | Registrar una empresa de autobuses, línea de taxis o terminal (empieza en `pending_review`)                                                                                |
| `/portal/organizations/:id`                        | Miembros                         | Datos; equipo, roles (`members.*`), invitaciones, solicitantes verificados; tasas de cambio (`routes.manage` edita)                                                        |
| `/admin`                                           | Personal de la plataforma        | Colas de revisión: organizaciones y solicitudes KYC                                                                                                                        |
| `/admin/applications/:id`                          | Personal de la plataforma        | Datos del solicitante, descarga de documentos, veredicto por documento, aprobar / pedir cambios / rechazar                                                                 |
| `/admin/stops`                                     | Personal de la plataforma        | Catálogo de paradas: agregar terminales y paradas, buscar, activar / desactivar                                                                                            |
| `/admin/settlements`, `/admin/settlements/:id`     | Administrador                    | Liquidaciones: saldo de cada empresa, su comisión, registrar y anular pagos ([settlements](settlements.md))                                                                |
| `/admin/refunds`                                   | Administrador                    | Pagos por reembolsar; marcarlos como devueltos con la referencia                                                                                                           |
| `/admin/metrics`                                   | Administrador                    | Métricas de la plataforma en un rango: ventas y comisión, reembolsos, usuarios nuevos, organizaciones, taxis ([reports](reports.md))                                       |
| `/portal/organizations/:id/settlement`             | `finance.view`                   | Saldo con la plataforma, reservas pagadas por mes, pagos recibidos                                                                                                         |
| `/portal/organizations/:id/reports`                | `finance.view` / `bookings.view` | Ventas por ruta y día, ocupación por salida, descarga en CSV                                                                                                               |
| `/portal/organizations/:id/routes/new`             | `routes.manage`                  | Crear una ruta: nombre y paradas ordenadas con el tiempo de viaje desde el origen                                                                                          |
| `/portal/organizations/:id/seat-layouts/new`       | `fleet.manage`                   | Editor de mapas de puestos: partir de una plantilla, hacer clic en las celdas para agregar o quitar puestos                                                                |
| `/portal/organizations/:id/trips?date=`            | `bookings.view`                  | Viajes con reservas en una fecha: puestos vendidos, apartados y libres                                                                                                     |
| `/portal/organizations/:id/trips/:tripId`          | `bookings.view`                  | Lista de pasajeros para el abordaje: puesto, nombre, documento, tramo, código de reserva, estado y hora de abordaje                                                        |
| `/portal/organizations/:id/vehicles`               | Miembros                         | Placas, nombre interno y mapa de puestos de cada vehículo; agregar, editar y desactivar (`fleet.manage`)                                                                   |
| `/portal/organizations/:id/taxi`                   | Líneas de taxi                   | Terminales donde opera (`routes.manage`); solicitudes abiertas y viajes de la línea, asignar y liberar (`operations.dispatch`); se actualiza cada 10 s ([taxis](taxis.md)) |
| `/portal/organizations/:id/dispatch?date=`         | `operations.dispatch`            | Todas las salidas del día con su vehículo y su conductor; asignar o quitar ([despacho](dispatch.md))                                                                       |
| `/portal/organizations/:id/seat-layouts/:layoutId` | Miembros                         | Ver o editar un mapa de puestos (`fleet.manage`); borrarlo si ningún horario lo usa                                                                                        |
| `/portal/organizations/:id/routes/:routeId`        | Miembros                         | Paradas, tarifas por par de paradas, horarios; publicar / desactivar (`routes.manage` para editar)                                                                         |

Las secciones que un rol no puede usar no se muestran, pero **la API aplica cada permiso**; la
interfaz solo lo refleja (`permissions` viene con cada membresía).

El portal y el panel de administración están solo en español; la web pública también en inglés y
portugués de Brasil ([idiomas](i18n.md)).

## Manejo de la sesión

- El inicio de sesión ocurre en **Server Actions** que llaman a la API con `client: 'web'` y
  guardan los tokens en cookies **httpOnly** (prefijo `__Host-` y `Secure` en producción,
  `SameSite=Lax`). Los tokens nunca llegan al JavaScript del navegador.
- `src/proxy.ts` (el middleware de Next.js 16, que cambió de nombre) protege `/portal` y `/admin`:
  sin sesión → `/login?next=…`; si el token de acceso vence en menos de un minuto → lo renueva con
  la API y rota las cookies antes de mostrar la página.
- La API revoca una sesión cuando se reutiliza un token de renovación, y los navegadores envían
  solicitudes en paralelo (precarga). Por eso las renovaciones se **unifican por token de
  renovación** (`src/lib/server/refresh.ts`): las solicitudes simultáneas o un poco tardías
  comparten una sola llamada a la API. Solo dentro del proceso — usa un almacén compartido antes
  de correr más de una instancia de la web.
- `getCurrentUser()` (`src/lib/server/session.ts`) es el punto de entrada para leer la sesión; con
  Cache Components debe mostrarse dentro de `<Suspense>` y usa `'use cache: private'`.
- Cada Server Action llama a la API con la sesión de quien la ejecuta, así que un formulario
  falsificado solo produce un error de la API. Next.js verifica el Origin de las solicitudes de
  Server Actions (CSRF).
- Las redirecciones con `?next=` solo aceptan rutas del mismo sitio (`safeNextPath`).
- Los documentos KYC se entregan por `/admin/applications/:id/documents/:documentId`, que reenvía
  el token del revisor; la API verifica el rol y audita el acceso.

## Formularios

`ActionForm` (`src/components/portal/action-form.tsx`) une un formulario a una Server Action y
muestra su mensaje. React reinicia un formulario después de ejecutar su acción, incluso si falla,
y un `<select>` reiniciado muestra el valor del primer renderizado en vez del guardado. Por eso
`ActionForm` envía de forma manual y conserva los campos; solo los formularios que agregan algo
nuevo (`resetOnSuccess`: invitar, agregar parada, agregar horario) se vacían tras un éxito. Las
acciones reemplazan los mensajes de validación de la API, que están en inglés, por mensajes en
español cuando conocen la regla (`failure(error, messages)` en `src/lib/server/form-actions.ts`).

## Configuración

| Variable                   | Dónde                            | Para qué                                                                            |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | al compilar, pública             | URL de la API (también se usa en el servidor si la siguiente no está definida)      |
| `API_INTERNAL_BASE_URL`    | al ejecutar, solo en el servidor | URL de la API desde el servidor web, por ejemplo `http://api:4000/api/v1` en Docker |

## Pruebas

Las pruebas unitarias cubren las opciones de las cookies, el momento de la renovación y su
unificación, los mensajes de error y `safeNextPath`. El flujo completo (registrarse → crear una
organización → invitar por teléfono → iniciar sesión con código → aceptar → aprobación de la
administración → revisión KYC con descarga de documentos → incorporar al solicitante → cerrar
sesión, más la renovación forzada del token con solicitudes en paralelo) se verificó en Chromium
contra una compilación de producción, igual que el flujo de la red (catálogo de paradas → ruta con
4 paradas → tarifas → horarios → publicar → búsqueda pública → desactivar), las liquidaciones
(saldo, pagos registrados y anulados, cola de reembolsos, política general y por empresa) y la
cancelación de viajes pagados. Una batería automatizada de pruebas en el navegador dentro de la
CI queda pendiente.

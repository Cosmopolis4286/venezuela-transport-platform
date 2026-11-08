# Manual de administración de la plataforma

Para el personal de VTP. El panel está en `/admin` de la web y en español. Hay dos roles
([organizaciones](../architecture/organizations.md#personal-de-la-plataforma)):

- **Revisor**: aprueba organizaciones y solicitudes KYC, y mantiene el catálogo de paradas.
- **Administrador**: todo lo anterior, más el dinero (cuentas de cobro y verificación de pagos,
  políticas, pagos a las empresas, reembolsos).

Los roles se otorgan desde el servidor, nunca desde la web:
`pnpm platform:grant --email persona@ejemplo.com --role admin` (o `reviewer`, `none`).

## Revisiones (`/admin`)

- **Organizaciones**: revisa la razón social y el RIF. **Aprobar** las habilita para operar;
  **Rechazar** o **Suspender** exige una nota que el dueño verá.
- **Solicitudes KYC**: abre cada solicitud, descarga y revisa los documentos (cada descarga queda
  registrada), marca cada documento como aceptado o rechazado con el motivo y decide: aprobar,
  pedir cambios o rechazar. Para conductores de una **línea de mototaxis**, verifica que la
  licencia sea del grado que permite conducir motos.

## Terminales y paradas (`/admin/stops`)

Agrega los terminales y paradas que usan las rutas (nombre, ciudad, estado y, si la tienes, la
ubicación). Desactivar una parada la saca de las búsquedas nuevas, sin romper las rutas que ya la
usan.

## Servicios (`/admin/services`)

Qué se vende: el servicio **entre ciudades** y cada **corredor suburbano** (ADR-029).

- **Corredores**: un corredor agrupa las paradas de un servicio suburbano (por ejemplo, Casacoima
  – San Félix – Puerto Ordaz). Los revisores los crean y eligen sus paradas; un corredor nuevo
  empieza **apagado**. No se puede quitar una parada que ya usa una ruta suburbana del corredor.
- **Encender y apagar** (solo administradores): cada corredor por separado, y el servicio entre
  ciudades en general o **solo en algunas ciudades** (no se venden salidas que suban o bajen
  allí; tampoco taxis de esos terminales).
- Apagar **solo detiene la venta**: los boletos pagados siguen valiendo y las empresas siguen
  operando. Siempre debe quedar algo encendido.
- La web y la app de pasajeros muestran el selector **Entre ciudades · Suburbano** solo cuando los
  dos están encendidos. Los cambios tardan unos minutos en verse en la web.

## Pagos (`/admin/payments`, solo administradores)

**Cuentas de cobro**: los datos que ven los pasajeros al pagar (pago móvil, transferencia, PIX,
USDT). Solo se ofrecen los métodos con una cuenta **activa**; desmarca **Activa** para dejar de
ofrecer uno sin borrar sus datos.

**Por verificar**: los pagos que los pasajeros informaron con su número de operación, los más
antiguos primero. Para cada uno:

1. Búscalo en el banco o la billetera por el **número de operación** y el **concepto**
   (`VTP-…`).
2. Si llegó, **Confirmar**. Si llegó otro monto, escríbelo antes: si no alcanza, el pago pasa a
   **Reembolsos**.
3. Si no llegó, **Rechazar** con un motivo claro: el pasajero lo recibe y puede pagar de nuevo.

Los puestos esperan hasta 6 horas; revisa la cola varias veces al día. Los pagos de las empresas
que cobran con sus propias cuentas no aparecen aquí: los verifican ellas en su portal.

**Empresas que cobran ellas mismas**: en **Liquidaciones → la empresa → Política**, elige «La
empresa, en sus propias cuentas». Su saldo baja en la comisión de cada reserva; cuando te pague,
regístralo en **Registrar un pago** con el tipo «Pago de la empresa a la plataforma».

## Liquidaciones (`/admin/settlements`, solo administradores)

### Política general

Comisión de la plataforma (hoy **8 %**) y **tramos de reembolso** (hoy 100 % con 48 h o más de
anticipación, 50 % con 2 h o más, nada después) para las empresas sin política propia. Un cambio
se aplica desde ese momento: las reservas ya pagadas conservan su comisión, y los tramos se leen
al cancelar.

### Una empresa

Abre la empresa en la lista para:

- fijar su **comisión** y/o sus **tramos** propios (vacío = la política general);
- ver su **saldo** por moneda y sus **reservas pagadas** del mes;
- **registrar un pago**.

### Procedimiento para pagarle a una empresa

1. Mira el **saldo por pagar** de la moneda.
2. Haz la transferencia (o pago móvil, o USDT) fuera de la plataforma.
3. **Registrar un pago** con la moneda, el monto, el medio y la **referencia** de la
   transferencia. No se puede registrar más que el saldo.
4. Si te equivocaste, **Anular** el pago con el motivo (no se borra ni se edita: queda en el
   historial, tachado). Luego registra el correcto.

La empresa ve cada pago en su portal.

## Reembolsos (`/admin/refunds`, solo administradores)

La cola muestra, de lo más antiguo a lo más nuevo, el dinero que debe volver a los pasajeros:

- **cancelaciones**: el pasajero canceló un viaje pagado; se devuelve el porcentaje que marca la
  política;
- **pagos que no confirmaron la reserva**: llegaron tarde, de menos, en otra moneda o para un pago
  anulado; se devuelve lo que llegó.

Procedimiento: devuelve el monto indicado **por el mismo medio** con el que pagó el pasajero
(usa su contacto si hace falta), y luego **Marcar como reembolsado** con la referencia de la
devolución. El pasajero recibe un aviso por push y correo.

## Métricas (`/admin/metrics`, solo administradores)

Para un rango de días: ventas y comisión de la plataforma por moneda, reembolsos enviados y los
que esperan en la cola, usuarios nuevos, organizaciones activas por tipo y taxis pedidos,
terminados y cancelados o vencidos.

## Tareas periódicas sugeridas

| Cada…  | Tarea                                                                         |
| ------ | ----------------------------------------------------------------------------- |
| Día    | Verificar los pagos informados (varias veces al día)                          |
| Día    | Atender la cola de reembolsos y las revisiones pendientes                     |
| Semana | Pagar los saldos de las empresas (la frecuencia es una decisión de operación) |
| Mes    | Revisar las reservas pagadas de cada empresa y la política general            |

## Si algo falla

- Un aviso que no llegó no deshace nada: la acción (pago, cancelación, reembolso) ya quedó hecha.
  El registro de avisos está en la tabla `notifications`.
- Toda acción de dinero queda en `audit_events` (quién, cuándo, qué montos).

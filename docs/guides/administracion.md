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
  pedir cambios o rechazar.

## Buscar reserva (`/admin/bookings`)

Para atender por WhatsApp o correo: con el código que envía el pasajero (`VTP-7K3QXA` o solo
`7K3QXA`) ves el estado, el pago (con enlace a Pagos o Reembolsos si hace falta), la factura, los
pasajeros y sus boletos, y cómo contactar al cliente. Cada búsqueda queda en la auditoría. Ver
[atención por WhatsApp](whatsapp-soporte.md).

## Taxis por WhatsApp (`/admin/taxi`)

Para pedir un taxi o mototaxi por alguien que escribió al WhatsApp (opción 2 del menú). Llena el
nombre y teléfono del cliente, taxi o mototaxi, la zona (terminal o parada de taxis), el viaje
(**dentro de la ciudad** pide también el destino), dónde lo buscan y cuántos son. Los conductores
de la zona lo ven en su app. En la lista, **Escribirle por WhatsApp** abre el chat con el mensaje
que toca según el estado (enlace de seguimiento, placa y tarifa, calificación), y **Ver lo que ve
el cliente** abre su página. La lista se actualiza sola. Paso a paso en la
[guía de WhatsApp](whatsapp-soporte.md#5-pedir-un-taxi-o-mototaxi-por-whatsapp).

## Terminales y paradas (`/admin/stops`)

Agrega los terminales y paradas que usan las rutas (nombre, ciudad, estado y, si la tienes, la
ubicación). La zona se asigna sola por la ubicación; se puede elegir o cambiar a mano. Desactivar una parada la saca de las búsquedas nuevas, sin romper las rutas que ya la
usan.

## Zonas operativas (`/admin/zones`, solo administradores)

Cada ciudad o región donde opera la plataforma. Para abrir una ciudad nueva:

1. Crea la zona en **Próximamente**, con su moneda, su comisión (vacía usa la de la plataforma) y
   el centro y radio del área (por ejemplo, 40 km).
2. Carga sus terminales y paradas en **Terminales y paradas**: las que tienen ubicación dentro del
   radio entran solas en la zona.
3. Cuando las empresas tengan sus rutas publicadas, pulsa **Activar**. Desde ese momento se venden
   pasajes y taxis allí.

**Pausar** oculta la zona y detiene las ventas nuevas (por ejemplo, ante un paro); las reservas
pagadas siguen valiendo. Las paradas sin zona venden como siempre.

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

## Facturación (`/admin/fiscal`, solo administradores)

La plataforma factura su tarifa por servicio (IVA incluido); el pasaje lo factura cada empresa.
Ver [fiscal.md](../architecture/fiscal.md).

1. **Datos fiscales**: razón social, RIF, domicilio, tipo de contribuyente (ordinario o formal) e
   IVA. Sin ellos no se puede emitir.
2. **Tasa BCV**: carga la tasa oficial de cada día hábil (bolívares por dólar).
3. **Facturas** (`/admin/fiscal/invoices`): cada pago deja un borrador. Créalo en el portal del
   SENIAT con esos datos y anota el número de factura, el número de control y la fecha: el sistema
   calcula base, IVA y total en bolívares. Si el comprador pide la factura a otro nombre, cámbialo
   antes de emitir. Las notas de crédito (salida cancelada por la empresa) se emiten después de su
   factura. Si el SENIAT anula un documento, anúlalo también aquí.
4. **Libros** (`/admin/fiscal/books`): libro de ventas y de compras del mes, con descarga en CSV
   para el contador. Las facturas de compra (hosting, servicios, etc.) se registran a mano.

## Tareas periódicas sugeridas

| Cada…  | Tarea                                                                         |
| ------ | ----------------------------------------------------------------------------- |
| Día    | Verificar los pagos informados (varias veces al día)                          |
| Día    | Atender la cola de reembolsos y las revisiones pendientes                     |
| Día    | Cargar la tasa BCV y emitir las facturas en borrador                          |
| Semana | Pagar los saldos de las empresas (la frecuencia es una decisión de operación) |
| Mes    | Revisar las reservas pagadas de cada empresa y la política general            |
| Mes    | Descargar los libros de ventas y compras para la declaración de IVA           |

## Si algo falla

- Un aviso que no llegó no deshace nada: la acción (pago, cancelación, reembolso) ya quedó hecha.
  El registro de avisos está en la tabla `notifications`.
- Toda acción de dinero queda en `audit_events` (quién, cuándo, qué montos).

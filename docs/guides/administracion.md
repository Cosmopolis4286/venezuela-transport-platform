# Manual de administración de la plataforma

Para el personal de VTP. El panel está en `/admin` de la web y en español. Hay dos roles
([organizaciones](../architecture/organizations.md#personal-de-la-plataforma)):

- **Revisión**: aprueba organizaciones y solicitudes KYC (con sus documentos), mantiene el
  catálogo de paradas, busca reservas y pide taxis por WhatsApp.
- **Finanzas**: el dinero (pagos por revisar, cuentas de cobro y tasas, liquidaciones y pagos a
  las empresas, reembolsos, facturación) y las métricas; ve las colas pero no aprueba nada.
- **Soporte**: atiende a los pasajeros (buscar reservas, taxis por WhatsApp) y ve las colas de
  empresas y KYC sin cédulas ni documentos; no aprueba ni toca dinero.
- **Administración**: todo lo anterior, más las zonas y los paquetes de viajes.

Cada rol ve en el menú solo sus secciones; si abre otra por su dirección, vuelve al inicio con un
aviso (la API lo rechaza igual). Los roles se otorgan desde el servidor, nunca desde la web:
`pnpm platform:grant --email persona@ejemplo.com --role admin` (o `reviewer`, `finance`,
`support`, `none`).

## Revisiones (`/admin`)

- **Organizaciones**: revisa la razón social y el RIF. **Aprobar** las habilita para operar;
  **Rechazar** o **Suspender** exige una nota que el dueño verá.
- **Solicitudes KYC**: abre cada solicitud, descarga y revisa los documentos (cada descarga queda
  registrada), marca cada documento como aceptado o rechazado con el motivo y decide: aprobar,
  pedir cambios o rechazar. Para conductores de una **línea de mototaxis**, verifica que la
  licencia sea del grado que permite conducir motos.
- **Documentos renovados** (ADR-042): los conductores aprobados suben una copia nueva de su
  licencia, certificado médico o póliza RCV cuando vence o está por vencer. Ábrela con **Ver
  archivo** (queda registrado), compara la fecha nueva con la actual y **Aprueba** (reemplaza la
  anterior; la póliza pasa también al vehículo) o **Rechaza** con el motivo, que el conductor ve.
  Mientras la licencia o el certificado estén vencidos, el conductor no puede conectarse.

## Taxis por WhatsApp (`/admin/taxi`)

Para pedir un taxi o una moto por alguien que escribió al WhatsApp (opción 2 del menú). Llena el
nombre y el teléfono del cliente y el viaje: **entre dos paradas** de una zona (taxi o moto, con
la tarifa fija de la línea) o **desde o hacia un terminal** (la línea dice la tarifa al tomarlo).
Los conductores lo ven en su app. En la lista, **Escribirle por WhatsApp** abre el chat con el
mensaje que toca según el estado (enlace de seguimiento, placa y tarifa, calificación) y **Ver lo
que ve el cliente** abre su página. La lista se actualiza sola. Paso a paso en la
[guía de WhatsApp](whatsapp-soporte.md#5-pedir-un-taxi-o-una-moto-por-whatsapp).

## Emergencias (`/admin/safety`, administradores y soporte)

Cuando un pasajero o un conductor toca **Emergencia** en un viaje de taxi o moto, al equipo con el
permiso `safety.manage` le llega un aviso (push y correo) y la alerta aparece arriba, en rojo, con
la placa, el recorrido, los nombres y teléfonos de ambos y **Ver en el mapa** (la última ubicación
del conductor). Llama primero a quien la envió; si hay riesgo, al 911 con la placa y la ubicación.
Al terminar, escribe qué hiciste y **Marcar como atendida**. Cada alerta queda registrada.

## Buscar reserva (`/admin/bookings`)

Para atender por WhatsApp o correo: con el código que envía el pasajero (`VTP-7K3QXA` o solo
`7K3QXA`) ves el estado, el pago (con enlace a Pagos o Reembolsos si hace falta), la factura, los
pasajeros y sus boletos, y cómo contactar al cliente. Cada búsqueda queda en la auditoría. Ver
[atención por WhatsApp](whatsapp-soporte.md).

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
anticipación, 50 % con 2 h o más, nada después) para las empresas sin política propia, y los
**tramos suburbanos** (hoy 100 % con 24 h, 75 % con 2 h, 50 % con 30 min, nada después), que valen
para las rutas suburbanas de todas las empresas. También la **cancelación de taxis y motos por
tramo**: minutos sin costo después de que una línea toma el viaje (hoy 3) y la tasa después (hoy
el 50 % de la tarifa), que el pasajero paga en su próximo viaje para la línea que salió a buscarlo.
Las horas aceptan cuartos: 0,5 son 30 minutos. Un cambio
se aplica desde ese momento: las reservas ya pagadas conservan su comisión, y los tramos se leen
al cancelar.

**Tasas de cambio de los paquetes** (Paquetes de viajes): los bolívares usan la tasa oficial del
BCV. La de reales (PIX) se escribe a mano y, con más de 24 horas, PIX deja de ofrecerse:
guárdala al menos una vez al día, aunque no cambie.

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

### Conductores independientes: comisión y pagos semanales (ADR-045)

Arriba en **Liquidaciones**:

- **Comisión (%)** de la línea de independientes. Si la subes, rige a los 30 días y los conductores
  reciben el aviso (Condiciones para Conductores, 4.2); si la bajas, desde ahora.
- **Pagos semanales por transferir**: cada lunes (desde las 9:00) se crea un pago por cada
  conductor al que se le debe al menos US$ 5 o Bs. 200 y registró su cuenta. Transfiere a la cuenta
  que se muestra, escribe la referencia y **Marcar como enviado**: el conductor recibe el aviso. Ya
  cuentan en su saldo mientras están pendientes. **Generar los pagos de esta semana** los crea antes
  (no duplica los ya creados).
- **Deudas**: en la liquidación de la línea, un conductor con saldo negativo debe comisiones; con
  más de US$ 20 o Bs. 800 no puede conectarse. Cuando pague, registra el monto en su fila
  (**Registrar lo que pagó el conductor**): nunca más de lo que debe.

## Paquetes de viajes (`/admin/trip-packs`, solo administradores)

- **Catálogo**: cada paquete es un tramo de una zona activa (dos paradas; sirve en los dos sentidos), un
  tipo de vehículo, una cantidad de viajes, un precio en US$ o Bs. y una vigencia (60 días por
  defecto). **Dejar de vender** lo saca de la venta; los paquetes ya comprados siguen valiendo.
  Cambiar un producto no cambia los paquetes ya comprados.
- **Tope por viaje** (opcional): lo máximo que la plataforma le paga a una empresa por cada viaje
  usado. Sin tope, se paga la tarifa de la empresa aunque la suba después de vendido el paquete;
  ponlo igual o algo mayor que las tarifas actuales del tramo para no perder dinero.
- **Tasas de cambio de la plataforma**: los bolívares usan siempre la tasa oficial del BCV; aquí
  solo se escribe la de reales (PIX).
- **Empresas adheridas**: en **Liquidaciones → la empresa**, marca **Acepta paquetes de viajes**
  después de acordarlo con ella. Solo sus rutas suburbanas aceptan paquetes; por cada viaje usado
  gana su tarifa normal del tramo (sin cargo ni comisión), hasta el tope por viaje.
- Los pagos de paquetes llegan a las cuentas de la plataforma y aparecen en **Pagos** como "paquete
  …"; se confirman o rechazan como los de las reservas. El dinero que llega para un paquete ya
  anulado aparece en **Reembolsos**.

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
terminados y cancelados o vencidos. Si se venden paquetes de viajes, también: paquetes vendidos,
viajes usados (y las tarifas que se les deben a las empresas por ellos), viajes vendidos que
todavía no se usan (servicio que la plataforma debe) y viajes que vencieron sin usarse.

## Facturación (`/admin/fiscal`, solo administradores)

La plataforma factura su tarifa por servicio (IVA incluido); el pasaje lo factura cada empresa.
Ver [fiscal.md](../architecture/fiscal.md).

1. **Datos fiscales**: razón social, RIF, domicilio, tipo de contribuyente (ordinario o formal) e
   IVA. Sin ellos no se puede emitir.
2. **Tasa BCV**: se actualiza sola cada 6 horas desde bcv.org.ve (o DolarApi si la página del
   BCV falla); con ella se cobra en bolívares y se factura. **Actualizar ahora desde el BCV** la
   busca en el momento. Si ninguna fuente responde, escríbela a mano: una tasa escrita a mano no
   se reemplaza. Sin una tasa de los últimos 5 días no se ofrece pagar en bolívares.
3. **Facturas** (`/admin/fiscal/invoices`): cada pago deja un borrador. Créalo en el portal del
   SENIAT con esos datos y anota el número de factura, el número de control y la fecha: el sistema
   calcula base, IVA y total en bolívares. Si el comprador pide la factura a otro nombre, cámbialo
   antes de emitir. Las notas de crédito (salida cancelada por la empresa) se emiten después de su
   factura. Si el SENIAT anula un documento, anúlalo también aquí.
4. **Libros** (`/admin/fiscal/books`): libro de ventas y de compras del mes, con descarga en CSV
   para el contador. Las facturas de compra (hosting, servicios, etc.) se registran a mano.

## Conductores independientes (`/admin/independents`, solo administradores)

Los taxistas y mototaxistas que trabajan por su cuenta «conducen con VTP» (ADR-039). Hay **una
línea de la plataforma por tipo de vehículo** (taxis y motos): créala aquí con su razón social, un
RIF propio y el nombre comercial que verán pasajeros y conductores (por ejemplo, «VTP»). Queda
activa y tú como dueña o dueño. Desde **Administrar en el portal** la manejas como cualquier línea:
tarifas por tramo, terminales, equipo (despachadores, supervisores, contador), viajes,
calificaciones y liquidación.

Los conductores nunca eligen ni ven la línea: en la app eligen carro o moto y envían su solicitud.
Cuando la apruebas en **Revisiones**, entran solos a la línea de ese vehículo y su vehículo queda en
la flota marcado como suyo, con su póliza RCV como seguro (si vence, no toma viajes).

**Suspendidos por calificación** (ADR-044): si el promedio de las últimas 30 calificaciones de un
independiente (con al menos 10) baja de 4,0, queda suspendido y desconectado, y aparece aquí con
sus comentarios bajos y su teléfono. Habla con la persona y, si corresponde, **Levantar la
suspensión** escribiendo qué revisaste o acordaste (lo ve en su aviso). Su promedio vuelve a contar
desde cero. En las demás líneas no se suspende a nadie: sus dueños reciben un aviso y deciden.

## Tareas periódicas sugeridas

| Cada…  | Tarea                                                                         |
| ------ | ----------------------------------------------------------------------------- |
| Día    | Verificar los pagos informados (varias veces al día)                          |
| Día    | Atender la cola de reembolsos y las revisiones pendientes                     |
| Día    | Revisar que la tasa BCV esté al día y emitir las facturas en borrador         |
| Semana | Pagar los saldos de las empresas (la frecuencia es una decisión de operación) |
| Mes    | Revisar las reservas pagadas de cada empresa y la política general            |
| Mes    | Descargar los libros de ventas y compras para la declaración de IVA           |

## Si algo falla

- Un aviso que no llegó no deshace nada: la acción (pago, cancelación, reembolso) ya quedó hecha.
  El registro de avisos está en la tabla `notifications`.
- Toda acción de dinero queda en `audit_events` (quién, cuándo, qué montos).

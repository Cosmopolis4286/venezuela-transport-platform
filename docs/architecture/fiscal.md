# Facturación y libros fiscales

La plataforma factura **solo su tarifa por servicio** (el recargo que paga el pasajero, ADR-029)
con el IVA incluido. El pasaje lo factura cada empresa de transporte con sus propios medios.
Decisión: [ADR-031](decisions.md#adr-031-la-plataforma-factura-su-tarifa-por-servicio-en-modo-borrador-hasta-tener-imprenta-digital).

> Borrador técnico: el contador debe validar la alícuota de IVA, el tratamiento del pasaje, el
> formato de los libros y si aplica el IGTF antes de usarlo en producción.

## Piezas

| Tabla             | Qué guarda                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| `fiscal_settings` | Una fila: razón social, RIF, domicilio fiscal, tipo de contribuyente, IVA. |
| `bcv_rates`       | Tasa oficial BCV por día (Bs por USD), cargada por el personal.            |
| `invoices`        | Facturas y notas de crédito: borrador → emitida (o anulada).               |
| `purchases`       | Facturas de compra recibidas, para el libro de compras.                    |

Código: `apps/api/src/modules/fiscal/`. Contratos: `packages/shared-types/src/api/fiscal.ts`.

## Cuándo se crea cada documento

| Hecho                                        | Documento                                                     |
| -------------------------------------------- | ------------------------------------------------------------- |
| Se confirma el pago de una reserva con cargo | Borrador de factura (`service_fee`) al primer pasajero        |
| La empresa cancela la salida, borrador       | El borrador se anula (nunca se emitió)                        |
| La empresa cancela la salida, ya emitida     | Borrador de nota de crédito (`fee_refund`) al mismo comprador |
| La empresa cancela la salida (ambos casos)   | Borrador de factura (`operator_cancellation`) a la empresa    |
| El pasajero cancela                          | Nada: el cargo no se devuelve y la factura queda              |

Se escriben dentro de la transacción del pago o de la cancelación (`fiscal-ledger.ts`) y hay un
solo documento por reserva y motivo, aunque el proveedor avise dos veces.

### A nombre de quién

Por defecto, del primer pasajero. El pasajero puede pedirla a otro nombre desde la reserva
(`PUT /me/bookings/:id/billing` con nombre, tipo y número de cédula o RIF y domicilio, o `null`
para volver al primer pasajero): se guarda en la reserva (`bookings.billing_*`) y, si el borrador
ya existe, lo actualiza. Una vez emitida la factura ya no cambia (`INVOICE_ALREADY_ISSUED`). La
reserva muestra la factura (`Booking.invoice`: estado, número, control y fecha) y los datos de
facturación (`Booking.billing`). Al borrar la cuenta se borran los datos de facturación de sus
reservas; las facturas se conservan.

## Emitir

`POST /api/v1/admin/fiscal/invoices/:id/issue`. Con `INVOICE_ISSUER=draft` (por defecto):

1. Completar los datos fiscales (`PUT /admin/fiscal/settings`) y la tasa BCV del día.
2. Crear la factura en el portal del SENIAT con los datos del borrador.
3. Anotar el número de factura, el número de control y la fecha de emisión.

Al emitir se fijan: tipo de contribuyente y alícuota vigentes, la tasa BCV del día de emisión (o la
última anterior), y los montos en bolívares. Con IVA incluido:

- **Ordinario**: base = total ÷ (1 + alícuota), redondeada al céntimo; IVA = total − base.
- **Formal**: no cobra IVA; todo el monto va como venta no gravada.

Una nota de crédito se emite solo después de su factura. Si el SENIAT anula un documento, se anula
aquí (`/void`): queda en el libro con montos en cero. El comprador de un borrador se puede cambiar
si pidió la factura a otro nombre (`PATCH /buyer`).

### Imprenta digital

`INVOICE_ISSUER=digital_printer` usa el adaptador `InvoiceIssuer` de la imprenta. Hoy es un
espacio vacío que responde 503; al contratar una imprenta autorizada se escribe su adaptador en
`invoice-issuer.ts` (llamar a su API, devolver número, número de control y referencia) con sus
credenciales en variables de servidor nuevas. Nada más cambia.

## Libros

- `GET /admin/fiscal/books/sales?month=YYYY-MM`: documentos con número emitidos en el mes, por
  fecha. Las notas de crédito restan y los anulados van en cero. La columna de IVA retenido queda
  en cero hasta que se registren retenciones.
- `GET /admin/fiscal/books/purchases?month=YYYY-MM`: compras del mes (base, exento, IVA).
- La web (`/admin/fiscal/books`) los muestra y los descarga en CSV para el contador.

Todo el módulo es solo para administradores de la plataforma y cada cambio queda en la auditoría.
Los documentos emitidos se conservan aunque el pasajero borre su cuenta (obligación tributaria).

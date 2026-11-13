# Reportes y métricas

Módulo `apps/api/src/modules/reports` (no tiene tablas propias: solo lee), contratos en
`packages/shared-types/src/api/reports.ts`.

## Rango de fechas

Todos los reportes reciben `?from=YYYY-MM-DD&to=YYYY-MM-DD`: días de Venezuela, ambos incluidos,
hasta 366 días. Sin fechas, los últimos 30 días. Un rango invertido o más largo responde 400.

## Para las empresas

| Reporte   | Endpoint                                   | Permiso         | Fuente y regla                                                                                            |
| --------- | ------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------- |
| Ventas    | `GET /organizations/:id/reports/sales`     | `finance.view`  | El libro de liquidaciones: reservas pagadas menos cancelaciones, por el día en que se pagó o canceló      |
| Ocupación | `GET /organizations/:id/reports/occupancy` | `bookings.view` | Las salidas del rango (por su fecha de servicio) con al menos una reserva: capacidad, vendidos, abordaron |

**Ventas** trae los totales por moneda, por ruta y por día: reservas pagadas, puestos (vendidos
menos cancelados), vendido, comisión, lo que gana la empresa, cuántas se cancelaron y cuánto se
devolvió. Como sale del mismo libro que las liquidaciones, cuadra con el saldo.

**Ocupación** cuenta los puestos de reservas confirmadas sobre la capacidad de la salida, y cuántos
de ellos abordaron; también los totales por ruta. Las salidas futuras entran si su fecha está en el
rango.

En el portal: **Reportes**, en la página de la empresa de autobuses, con el rango, las tablas y
**Descargar CSV** (`/portal/organizations/:id/reports/export?kind=sales|occupancy&from=&to=`, una
ruta de la web que convierte el JSON de la API en una hoja de cálculo: UTF-8 con BOM para Excel,
y las celdas que parecen fórmulas se neutralizan).

### Efectivo (ADR-033)

`SalesReport.cash` suma lo que los conductores anotaron como cobrado en efectivo
(`POST /organizations/:id/cash-sales`), por moneda y por ruta, según el día en que se anotó y sin
los registros anulados. Va aparte de las ventas por la app: no lleva comisión ni se liquida. El
CSV de ventas lo agrega como filas "Ruta (efectivo)".

## Para la plataforma

`GET /admin/metrics` (solo administradores): ventas y comisión de toda la plataforma por moneda,
reembolsos enviados en el rango y los que esperan en la cola, usuarios nuevos, organizaciones
activas por tipo y taxis pedidos, terminados y cancelados o vencidos. En el panel:
**Métricas** (`/admin/metrics`).

### Paquetes de viajes

Las ventas de cada empresa incluyen `packSeats`: cuántos de sus puestos se pagaron con paquetes
(también en el CSV). Las métricas de la plataforma traen `tripPacks` (ADR-035):

- **vendidos**: paquetes pagados en el rango, con sus viajes y lo que se cobró, por moneda;
- **usados**: viajes usados en el rango (menos los devueltos) y las tarifas que se les deben a las
  empresas por ellos;
- **por usar**: viajes vendidos que siguen en paquetes activos hoy, valorados al precio por viaje
  de cada paquete (el servicio que la plataforma todavía debe);
- **vencidos**: viajes que se perdieron en paquetes vencidos en el rango (su dinero queda para la
  plataforma).

## Todavía no

Gráficos, comparar con el período anterior, reportes de taxis por línea, ventas por canal o medio
de pago, y exportar a PDF. Si los reportes se vuelven lentos con mucho volumen, conviene una tabla
resumen diaria en vez de sumar el libro cada vez.

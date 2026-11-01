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

## Para la plataforma

`GET /admin/metrics` (solo administradores): ventas y comisión de toda la plataforma por moneda,
reembolsos enviados en el rango y los que esperan en la cola, usuarios nuevos, organizaciones
activas por tipo y taxis pedidos, terminados y cancelados o vencidos. En el panel:
**Métricas** (`/admin/metrics`).

## Todavía no

Gráficos, comparar con el período anterior, reportes de taxis por línea, ventas por canal o medio
de pago, y exportar a PDF. Si los reportes se vuelven lentos con mucho volumen, conviene una tabla
resumen diaria en vez de sumar el libro cada vez.

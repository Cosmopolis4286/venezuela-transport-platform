# Guía para empresas de autobuses y líneas de taxis

Cómo usar el **portal** (`/portal` en la web) para registrar tu empresa, publicar rutas, vender,
despachar y cobrar. El portal está en español. Lo que cada persona puede hacer depende de su rol
(dueño, administrador, despachador, taquillero, conductor, inspector); ver
[organizaciones y roles](../architecture/organizations.md).

## 1. Registrar la empresa

1. Crea una cuenta en `/register` (o entra en `/login`).
2. **Registrar organización**: tipo (empresa de autobuses, línea de taxis o terminal), razón
   social, nombre comercial y RIF (`J-12345678-9`).
3. La administración de VTP la revisa. Mientras tanto puedes invitar a tu equipo, pero no vender.

## 2. Tu equipo

En la página de la organización:

- **Invitar** por correo o teléfono con un rol. La persona entra con ese contacto y acepta la
  invitación.
- **Solicitantes verificados**: conductores y personal que enviaron sus documentos (KYC) y fueron
  aprobados por VTP; acéptalos para sumarlos.
- Cambiar roles o quitar miembros (dueño y administrador).

## 3. Publicar rutas (empresas de autobuses)

1. **Mapas de puestos**: crea el de cada tipo de bus (hay plantillas).
2. **Rutas → Nueva ruta**: nombre y paradas en orden, con los minutos desde el origen. Las paradas
   salen del catálogo de VTP; si falta un terminal, pídeselo a la administración.
3. **Tarifas** por tramo (US$ o Bs.).
4. **Horarios**: hora de salida, días de la semana, vigencia, clase de servicio y mapa de puestos.
5. **Publicar** la ruta: desde ese momento aparece en las búsquedas.
6. **Tasas de cambio**: bolívares y reales por dólar. Sin una tasa, ese medio de pago no se ofrece
   para tarifas en dólares.

## 4. El día de la salida

- **Vehículos**: registra placas y el mapa de puestos de cada unidad.
- **Despacho**: para cada salida del día, elige vehículo y conductor. El sistema no deja poner un
  vehículo o un conductor en dos viajes a la vez. El conductor recibe un aviso en su app.
- **Viajes y pasajeros**: las reservas de cada salida y la lista de pasajeros, con quién abordó.
- Los inspectores escanean los boletos con la app de transportistas ([guía](conductores.md)).

## 5. Taxis (líneas de taxis)

1. **Taxis → Terminales**: elige en qué terminales opera tu línea.
2. El tablero muestra las solicitudes de esos terminales. Un despachador puede asignar una a un
   conductor y vehículo con su tarifa, o tus conductores la toman desde su app.
3. Por ahora el pasajero le paga al conductor; la plataforma no cobra los taxis.

## 6. Liquidaciones: lo que te debe la plataforma

Los pasajeros le pagan a VTP. Por cada reserva pagada, tu empresa gana la tarifa menos la comisión
de la plataforma, en la moneda de la tarifa. En **Liquidaciones** (dueño y administrador) ves:

- el **saldo** por moneda: vendido, comisión, ganado, pagado y lo que falta por pagar;
- la **comisión** y la **política de reembolsos** que se aplican a tu empresa;
- las **reservas pagadas** de cada mes, incluidas las canceladas (con monto negativo);
- los **pagos recibidos** de VTP, con su referencia.

Si un pasajero cancela, el reembolso se descuenta de lo que ganaste por esa reserva; la plataforma
conserva su comisión. Si ya cobraste y luego hay una cancelación, el saldo puede quedar negativo y
se descuenta del próximo pago. Para negociar otra comisión u otros tramos de reembolso, habla con
la administración de VTP.

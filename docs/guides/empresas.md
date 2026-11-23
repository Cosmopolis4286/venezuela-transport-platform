# Guía para empresas de autobuses y líneas de taxis

Cómo usar el **portal** (`/portal` en la web) para registrar tu empresa, publicar rutas, vender,
despachar y cobrar. El portal está en español. Lo que cada persona puede hacer depende de su rol
(dueño, administrador, despachador, taquillero, conductor, inspector, contador, supervisor);
ver
[organizaciones y roles](../architecture/organizations.md).

## 1. Registrar la empresa

1. Crea una cuenta en `/register` (o entra en `/login`).
2. **Registrar organización**: tipo (empresa de autobuses, línea de taxis o terminal), razón
   social, nombre comercial y RIF (`J-12345678-9`).
3. La administración de VTP la revisa. Mientras tanto puedes invitar a tu equipo y preparar
   flota y rutas en borrador, pero no vender, despachar ni validar boletos. Si VTP suspende la
   empresa, el portal sigue mostrando los datos pero no deja operar.

## 2. Tu equipo

En la página de la organización:

- **Invitar** a tus conductores y personal, por correo (recomendado) o teléfono, con un rol. Es la
  única forma de sumarlos: tu empresa no aparece en ningún buscador y nadie se postula a ella. A la
  persona le llega un correo (o un push, si ya tiene cuenta); instala la app **VTP Transportistas**
  (conductores) o entra al portal con ese correo y acepta la invitación.
- Cambiar roles o quitar miembros: el dueño a cualquiera; el administrador solo al personal
  operativo (no puede nombrar, cambiar ni quitar administradores ni dueños).
- Roles para la oficina: **Contador** (saldo, liquidaciones, cobros, reembolsos y reportes de
  ventas, sin operar) y **Supervisor** (despacho, validar boletos y ocupación, sin dinero).
- Si alguien abre una sección que su rol no permite, el portal lo devuelve a la página de la
  empresa con un aviso.

## 3. Publicar rutas (empresas de autobuses)

1. **Mapas de puestos**: crea el de cada tipo de bus (hay plantillas).
2. **Rutas → Nueva ruta**: nombre y paradas en orden, con los minutos desde el origen. Las paradas
   salen del catálogo de VTP; si falta un terminal, pídeselo a la administración.
   Si la ruta es de motos o de carros, elige el **tipo de vehículo** al crearla.
3. **Tarifas** por tramo (US$ o Bs.).
4. **Horarios**: hora de salida, días de la semana, vigencia, clase de servicio y mapa de puestos.
   En rutas **urbanas o suburbanas** puedes poner una **frecuencia** (por ejemplo, cada 15
   minutos) y la **última salida**: se vende un **boleto abierto** para el día, válido en
   cualquier unidad, sin puesto ni mapa. "Puestos" es entonces la capacidad de una unidad.
5. **Tipo de servicio y cobro**: interurbana o urbana/suburbana, y quién cobra. Por defecto, las
   interurbanas le pagan a la empresa y las urbanas o suburbanas al conductor de cada viaje; puedes
   cambiarlo en cada ruta (vale para las ventas desde ese momento).
6. **Publicar** la ruta: desde ese momento aparece en las búsquedas.
7. **Tasas de cambio**: los bolívares usan siempre la tasa oficial del BCV, que la plataforma
   actualiza sola (la ves en el portal). Solo escribes la de reales por dólar si aceptas PIX; sin
   ella, PIX no se ofrece para tarifas en dólares.

## 4. El día de la salida

- **Vehículos**: registra placas y el mapa de puestos de cada unidad, y en **Documentos** el
  certificado de circulación, la póliza RCV y el permiso de transporte con su vencimiento. Se
  marcan **por vencer** (30 días o menos) y **vencidos**, y el despacho los avisa al elegir el
  vehículo. Quienes manejan la flota reciben además un aviso (push y correo) 30 días antes de que
  venza cada documento y otra vez el día que vence.
- **Despacho**: para cada salida del día, elige vehículo y conductor. El sistema no deja poner un
  vehículo o un conductor en dos viajes a la vez, ni un vehículo con la **póliza RCV vencida** ese
  día. El conductor recibe un aviso en su app.
- **Cancelar una salida** (en Despacho, antes de que salga): escribe el motivo. Se cancelan todas
  sus reservas, las pagadas se reembolsan **completas** (la comisión de VTP la asume tu empresa),
  y cada pasajero recibe un aviso con el motivo. La salida deja de venderse.
- **Viajes y pasajeros**: las reservas de cada salida y la lista de pasajeros, con quién abordó.
  Cuando el conductor marca la salida y la llegada, la salida muestra "En ruta desde las…" y
  "Llegó…".
- Los inspectores escanean los boletos con la app de transportistas ([guía](conductores.md)),
  también **sin señal**: el teléfono guarda los boletos del día y envía lo validado al volver la
  señal. Si al llegar resulta que un boleto se usó en dos unidades, o su reserva estaba cancelada,
  aparece en **Viajes y pasajeros → Abordajes sin señal para revisar** de ese día.

## Líneas de mototaxis

Publican **rutas urbanas o suburbanas** de moto, igual que en el paso 3, con dos
diferencias: cada salida es **una moto con un pasajero** (no hay mapas de puestos ni cantidad de
puestos que elegir) y no hay taxis de terminal. En **Vehículos** registras las placas de las motos
y sus documentos; en el despacho asignas moto y conductor a cada salida.

## 5. Taxis (líneas de taxis)

1. **Taxis → Terminales**: elige en qué terminales opera tu línea.
2. El tablero muestra las solicitudes de esos terminales. Un despachador puede asignar una a un
   conductor y vehículo con su tarifa, o tus conductores la toman desde su app.
3. Por ahora el pasajero le paga al conductor; la plataforma no cobra los taxis.
4. **Viajes por tramo (suburbano)**: en **Taxis** (o **Mototaxis**), carga tus **tarifas por
   tramo**: dos paradas de una zona y el monto, en los dos sentidos. Tus conductores ven las
   solicitudes de esos tramos (ahora o programadas) y al tomarlas se cobra tu tarifa, sin
   escribirla. Un viaje programado que tomas no te impide tomar otros hasta la hora de recoger.
   Si tu línea **acepta paquetes de viajes** (lo activa VTP), también ves los viajes pagados con
   paquete ("Pagado con paquete": no cobres); VTP te paga tu tarifa del tramo al terminarlos.
5. En los viajes terminados ves la calificación del pasajero (1 a 5 estrellas y su comentario).
   Algunos pedidos los carga el soporte por un cliente que escribió por WhatsApp: se atienden
   igual.

## 6. Cobros y liquidaciones

**¿Quién recibe el dinero?** Por defecto, VTP: los pasajeros pagan a las cuentas de la plataforma y
VTP le paga a tu empresa lo que gana. Si lo acuerdas con VTP, tu empresa puede **cobrar con sus
propias cuentas**. Entonces, en **Cobros** (dueño y administrador):

1. Carga tus **cuentas de cobro** (pago móvil, transferencia, PIX, USDT): es lo que ven tus
   pasajeros al pagar.
2. Revisa **Por verificar** varias veces al día: busca cada pago en tu banco por el número de
   operación y el concepto (`VTP-…`) y **Confirma** o **Rechaza** con un motivo (los puestos
   esperan hasta 6 horas).
3. Atiende tus **Reembolsos**: devuelve el dinero por el mismo medio y registra la referencia.
4. Págale a VTP su **comisión**; tu saldo en Liquidaciones muestra cuánto debes.

Por cada reserva pagada, tu empresa gana la tarifa menos la comisión de la plataforma, en la moneda
de la tarifa. En **Liquidaciones** (dueño y administrador) ves:

- el **saldo** por moneda: vendido, comisión, ganado, lo cobrado por tu empresa, los pagos en cada
  sentido y lo que falta por pagar (o «Debe», si tu empresa le debe la comisión a VTP);
- la **comisión** y la **política de reembolsos** que se aplican a tu empresa;
- las **reservas pagadas** de cada mes, incluidas las canceladas (con monto negativo);
- los **pagos recibidos** de VTP, con su referencia.

## 7. Reportes

En **Reportes** (empresas de autobuses) eliges un rango de días y ves:

- **Ventas** (dueño y administrador): lo vendido, la comisión y lo que gana la empresa, por ruta y
  por día, con las cancelaciones y lo devuelto. Cuadra con las liquidaciones.
- **Efectivo cobrado por los conductores**: los pasajeros que tus conductores anotaron como pagados
  en efectivo, por ruta. No lleva comisión ni entra en la liquidación.
- **Ocupación** (quien puede ver los viajes): por cada salida con reservas, la capacidad, los
  puestos vendidos, cuántos abordaron y el porcentaje de ocupación, y los totales por ruta.

**Descargar CSV** baja cada reporte para abrirlo en Excel, Google Sheets o LibreOffice.

## Liquidaciones: cancelaciones

Si un pasajero cancela, el reembolso se descuenta de lo que ganaste por esa reserva; la plataforma
conserva su comisión. Si ya cobraste y luego hay una cancelación, el saldo puede quedar negativo y
se descuenta del próximo pago. Para negociar otra comisión u otros tramos de reembolso, habla con
la administración de VTP.

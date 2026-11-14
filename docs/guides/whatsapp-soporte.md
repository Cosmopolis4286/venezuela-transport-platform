# Atención por WhatsApp

Cómo atender a pasajeros, empresas y conductores con la app gratuita **WhatsApp Business**, y
cómo apoyarse en el panel de administración. WhatsApp **no está conectado al sistema**: sirve
para conversar; las reservas, los pagos y los boletos se hacen siempre en la app o en el panel.

> Reemplaza `TU-DOMINIO` por el dominio de la web (por ejemplo `orivana.com`). El enlace
> `https://TU-DOMINIO/es/app` no cambia aunque la app pase del APK a Google Play: lo que cambia es
> `ANDROID_APP_URL` en el servidor.

## 1. Preparar la cuenta (una vez)

1. Instala **WhatsApp Business** en un teléfono de soporte, con un número dedicado.
2. **Perfil de empresa**: nombre comercial, categoría "Transporte", descripción corta, horario,
   correo y sitio web `https://TU-DOMINIO`.
3. En el servidor, pon ese número en `SUPPORT_WHATSAPP` (formato internacional, por ejemplo
   `+58 412 123 4567`): la web y las apps muestran "Escríbenos por WhatsApp".
4. Configura los mensajes automáticos y las respuestas rápidas de abajo (en la app:
   **Herramientas para la empresa**).
5. Ten abierta, en una computadora o en el navegador del teléfono, la página
   **Administración → Taxis por WhatsApp** (`https://TU-DOMINIO/admin/taxi`) con una cuenta del
   personal, para cargar los pedidos de taxi y moto.
6. Crea las **etiquetas**: `Pago por verificar`, `Reembolso`, `Taxi`, `Turismo`, `Empresa`,
   `Conductor`, `Resuelto`.

## 2. Mensajes automáticos

**Mensaje de bienvenida** (se envía solo con el primer mensaje de cada persona, o tras 14 días
sin conversar):

```
¡Hola! Bienvenido a Orivana 🚐🌴 Responde con el número de lo que necesitas:
1️⃣ Reservar puesto (Casacoima – San Félix / Tucupita)
2️⃣ Pedir taxi o moto 🛵🚕
3️⃣ Paquetes turísticos Full Day
4️⃣ Descargar la app
5️⃣ Tengo un problema con un pago o una reserva
Te respondemos en minutos, de 6:00 a. m. a 8:00 p. m.
```

> La app WhatsApp Business **no responde sola** al número que elija la persona: alguien contesta
> con la respuesta rápida que corresponde (`/1`, `/2`…). Responder dentro del horario es gratis
> y sin límite.

**Mensaje de ausencia** (fuera del horario):

```
Gracias por escribir a Orivana. Estamos fuera de horario (6:00 a. m. – 8:00 p. m.) y te
respondemos apenas abramos. Si quieres viajar, puedes reservar y pagar ya desde la app:
https://TU-DOMINIO/es/app
```

## 3. Respuestas rápidas

Escribe el atajo en el chat y elige la respuesta. Copia los textos tal cual.

| Atajo   | Texto                                                                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/1`    | Reserva y paga desde la app, **sin necesidad de registrarte**: buscas la ruta, tocas "Continuar sin crear cuenta", eliges cuántos pasajeros, pagas con pago móvil o transferencia usando la **referencia** que te da la app y recibes tu boleto QR. Descárgala aquí: https://TU-DOMINIO/es/app |
| `/2`    | ¡Claro! Envíanos en un solo mensaje: 1️⃣ ¿Taxi o moto? (la moto lleva a una persona) 2️⃣ ¿Desde qué parada o sector y hasta dónde? 3️⃣ ¿Dónde te buscamos? (calle y una referencia) 4️⃣ ¿Cuántas personas? 5️⃣ Tu nombre. Te decimos el precio y te mandamos un enlace para seguirlo.               |
| `/2app` | También puedes pedirlo tú mismo en la app, sin registrarte: https://TU-DOMINIO/es/app                                                                                                                                                                                                          |
| `/2ya`  | ¡Listo, ya lo pedimos! Abre el enlace que te enviamos: ahí ves cuándo lo toma un conductor, la placa y el precio, y puedes cancelarlo si ya no lo necesitas.                                                                                                                                   |
| `/2esp` | Seguimos buscando un conductor libre. Si en unos minutos nadie lo toma, te avisamos para pedirlo de nuevo.                                                                                                                                                                                     |
| `/3`    | (Tus paquetes Full Day: destino, qué incluye, precio, fechas y cómo reservar. Hoy se atienden solo por este chat.)                                                                                                                                                                             |
| `/4`    | Descarga la app de Orivana para Android aquí: https://TU-DOMINIO/es/app (la de iPhone llega pronto).                                                                                                                                                                                           |
| `/5`    | Con gusto te ayudamos. Envíanos el **código de tu reserva** (empieza por VTP-, lo ves en la app en Mis viajes) y, si ya pagaste, el **número de operación** del pago.                                                                                                                          |
| `/pago` | Para pagar, usa siempre los datos y la **referencia** que te muestra la app al reservar: así tu pago se confirma y recibes tu boleto. No te enviaremos datos bancarios por este chat ni te pediremos claves o códigos.                                                                         |
| `/ok`   | ¡Listo! Tu pago quedó confirmado y ya tienes tu boleto QR en la app, en Mis viajes. Muéstralo al conductor al subir. ¡Buen viaje! 🚐                                                                                                                                                           |
| `/reem` | Tu reembolso quedó registrado. Te devolvemos el monto por el mismo medio con el que pagaste y te llega un aviso cuando esté hecho.                                                                                                                                                             |
| `/emp`  | ¿Tienes una línea o empresa de transporte? Regístrala en https://TU-DOMINIO/portal y te contactamos para activarla.                                                                                                                                                                            |
| `/cond` | ¿Eres conductor? Descarga la app de transportistas, entra con tu correo y acepta la invitación de tu empresa (o envía tu solicitud desde la app).                                                                                                                                              |

**Nunca** envíes por el chat los datos de las cuentas de cobro: un pago sin la referencia de la
reserva no se asocia a nada, no genera boleto y hay que cuadrarlo a mano. Tampoco pidas
contraseñas, códigos de acceso ni fotos de documentos.

## 4. Qué hacer en cada caso

| Caso                                    | Pasos                                                                                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Pagué y no me llega el boleto"         | 1) Pide el código (`/5`). 2) En **Administración → Buscar reserva** escribe el código. 3) Si el pago dice "Informado", ve a **Pagos**, compáralo con el banco y verifícalo. 4) Responde `/ok`. Etiqueta `Resuelto`.                     |
| "Pagué de más / tarde / en otra moneda" | Busca la reserva: el pago queda "Por reembolsar". En **Reembolsos**, devuelve por el mismo medio y marca la referencia. Responde `/reem`.                                                                                               |
| Quiere cancelar                         | Explica que se cancela en la app (Mis viajes → la reserva → Cancelar viaje), que muestra cuánto se devuelve antes de confirmar.                                                                                                         |
| La empresa canceló la salida            | La reserva lo muestra. El reembolso es completo y queda en **Reembolsos**; avísale cuando se haga.                                                                                                                                      |
| Compró sin cuenta y borró la app        | Búscalo por código (o pídele el documento del pasajero). Los boletos siguen válidos: dale el código de reserva; el conductor puede validarlo con el código y el puesto o número de boleto. Recomiéndale crear su cuenta la próxima vez. |
| No le llega el código para entrar       | Que revise la carpeta de spam y que el correo esté bien escrito; puede pedir otro código en 1 minuto.                                                                                                                                   |
| Factura a nombre de su empresa          | En la app, en la reserva: **Factura a otro nombre**, antes de que se emita.                                                                                                                                                             |
| Paquetes turísticos                     | Se atienden solo por el chat (no están en el sistema). Etiqueta `Turismo`.                                                                                                                                                              |

El botón **Escribirle por WhatsApp** de la búsqueda de reservas abre un chat con el pasajero (si
dejó su teléfono), con el código ya escrito. Cada búsqueda de una reserva queda en la auditoría.

## 5. Pedir un taxi o una moto por WhatsApp

La persona no necesita la app ni una cuenta. Quien atiende el chat:

1. Cuando elige **2**, responde `/2` y espera los datos. Si falta algo (por ejemplo, la
   referencia), pregúntalo.
2. Abre **Administración → Taxis por WhatsApp** y copia los datos: nombre, teléfono (el del chat),
   el viaje (**entre dos paradas**, con taxi o moto; o **desde o hacia un terminal**), dónde lo
   buscan y cuántos son. Pulsa **Pedir**. Etiqueta el chat `Taxi`.
3. En la lista, pulsa **Escribirle por WhatsApp**: se abre el chat con el mensaje y el enlace ya
   escritos; solo envíalo.
4. Cuando la lista muestre **Aceptado**, pulsa otra vez el botón: ahora el mensaje lleva la placa,
   el conductor y la tarifa. Si tarda, responde `/2esp`.
5. Al terminar el viaje, pulsa el botón una vez más: el mensaje le pide calificar el viaje de 1 a
   5 estrellas en el mismo enlace. La calificación la ven la línea y el personal.
6. Si nadie lo toma a tiempo (**Vencido**), el botón le ofrece pedirlo de nuevo: carga otro
   pedido.

El cliente puede **cancelar** desde el enlace hasta que lo recojan (si una línea ya lo tomó, puede
deber la tasa por cancelar tarde, como en la app). El enlace no muestra teléfonos y deja de
funcionar a los 7 días. Al taxi se le paga directamente al conductor; nunca cobres un viaje por el
chat.

## 6. Más adelante

Responder solo al número del menú, o enviar confirmaciones de pago automáticas por WhatsApp,
necesita la **API oficial de Meta** (las respuestas dentro de las 24 horas siguientes al mensaje
del cliente son gratis; los mensajes que inicia la empresa se cobran por mensaje). Se evaluará
después del piloto. No uses bibliotecas no oficiales que imitan WhatsApp Web: violan las
condiciones de WhatsApp y el número puede ser bloqueado.

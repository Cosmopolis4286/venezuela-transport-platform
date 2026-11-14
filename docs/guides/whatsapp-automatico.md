# WhatsApp automático (menú, taxis y motos, avisos)

Con la **API de WhatsApp en la nube de Meta** el número de soporte responde solo: muestra el menú,
pide taxis y motos paso a paso con el precio antes de pedirlos, avisa cuando un conductor toma el
viaje y pide la calificación al final. Está **apagado** hasta que lo configures
(`WHATSAPP_DELIVERY=cloud`); mientras tanto todo funciona como en la
[atención manual](whatsapp-soporte.md). Decisión: ADR-038.

## Cuánto cuesta

La plataforma **solo escribe dentro de las 24 horas** siguientes al último mensaje de la persona
(la "ventana de atención" de Meta) y **nunca** usa plantillas pagas. Hoy esas respuestas son
gratis. Si un aviso cae fuera de la ventana no se envía: queda registrado como
`outside_window` y el personal usa el botón de **Administración → Taxis por WhatsApp**.

> Meta cambia sus precios con frecuencia (hubo cambios anunciados para el 1 de octubre de 2026).
> Antes de encenderlo, revisa la página de precios de Meta para WhatsApp Business. Si las
> respuestas dentro de la ventana dejaran de ser gratis, deja `WHATSAPP_DELIVERY=disabled`.

La conexión con Meta no cuesta, pero pide trámites (verificar la empresa) y un servidor con
dominio y HTTPS (el VPS de la [guía de lanzamiento](../deployment/launch-guide.md)).

## Qué hace el bot

| La persona escribe…             | El bot…                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cualquier cosa, "hola" o "menú" | Muestra el menú: 1 Reservar puesto, 2 Pedir taxi o moto, 3 Paquetes Full Day, 4 Descargar la app, 5 Problema con un pago. Se toca la opción o se escribe el número.                   |
| 1 o 4                           | Manda el enlace de la app (`https://TU-DOMINIO/es/app`). Nunca escribe datos bancarios: los pagos se hacen en la app con su referencia.                                               |
| 2                               | Taxi o moto → desde qué parada → hasta cuál (con el **precio** de cada una) → dónde lo buscan (escrito o **ubicación** 📍) → cuántos (la moto lleva a 1) → confirma. Manda el enlace. |
| (el conductor toma el viaje)    | Avisa con la placa, el conductor y el precio.                                                                                                                                         |
| (el viaje termina)              | Pide de 1 a 5 estrellas; se toca o se escribe el número.                                                                                                                              |
| (nadie lo toma a tiempo)        | Avisa y ofrece pedirlo de nuevo con _2_.                                                                                                                                              |
| 3 o 5                           | **Pasa el chat a una persona** por 12 horas: el bot no responde hasta que alguien escriba _menú_.                                                                                     |
| "cancelar" a mitad de un pedido | No pide nada y vuelve al menú.                                                                                                                                                        |

Los viajes por WhatsApp son **por tramo** (dos paradas de una zona con tarifa fija, ADR-035). Para
un taxi desde o hacia un terminal, la persona elige 5 y el personal lo carga en
**Administración → Taxis por WhatsApp**. Cada número de WhatsApp tiene su pasajero invitado
(ADR-034): sus viajes quedan juntos.

## Configurarlo (una vez)

Los nombres de las pantallas de Meta cambian; si algo no coincide, sigue la guía oficial
"Get started" de la WhatsApp Cloud API en developers.facebook.com.

1. **Cuenta de Meta Business** (business.facebook.com) a nombre de la empresa, y
   **verificación del negocio** (RIF y documentos). Sin verificar, el número tiene límites bajos.
2. **Número**: uno que reciba SMS o llamadas para el código. Si es el mismo número que hoy usa la
   app WhatsApp Business, revisa si Meta ofrece en Venezuela la **coexistencia** (usar la app y la
   API a la vez); si no, el número deja de funcionar en la app al pasar a la API y conviene un
   número nuevo solo para el bot.
3. En developers.facebook.com: **Crear app** → tipo _Business_ → agrega el producto
   **WhatsApp**. Anota el **Phone number ID** (WhatsApp → API Setup).
4. **Token permanente**: en Business Settings → _System users_, crea un usuario de sistema
   administrador, asígnale la app y la cuenta de WhatsApp, y genera un token con el permiso
   `whatsapp_business_messaging` (y `whatsapp_business_management`). El token temporal de la
   pantalla de pruebas vence en 24 horas: no lo uses.
5. **App secret**: en la app, _App settings → Basic → App secret_.
6. Inventa un **verify token** (texto aleatorio largo, por ejemplo `openssl rand -hex 24`).
7. En el servidor, en el `.env` de la API (nunca en la web ni en las apps):

   ```
   PUBLIC_WEB_URL=https://TU-DOMINIO
   WHATSAPP_DELIVERY=cloud
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   WHATSAPP_ACCESS_TOKEN=<token permanente>
   WHATSAPP_APP_SECRET=<app secret>
   WHATSAPP_VERIFY_TOKEN=<tu verify token>
   ```

   Reinicia la API. Si falta alguno, la API no arranca y dice cuál.

8. **Webhook**: en la app de Meta, WhatsApp → _Configuration_ → _Webhook_ → **Callback URL**
   `https://api.TU-DOMINIO/api/v1/whatsapp/webhook` y **Verify token** el mismo del paso 6.
   Pulsa _Verify and save_ y suscribe el campo **messages**.
9. **Prueba**: desde otro teléfono escribe "hola" al número. Debe llegar el menú. Pide una moto
   por un tramo que tenga tarifa y acéptala desde la app de transportistas: debe llegar el aviso
   con la placa.
10. Publica la app de Meta (_Live_) cuando todo funcione.

## Si algo falla

- **No responde**: revisa los logs de la API (`WhatsApp webhook failed`, `Cloud API answered 401`
  = token vencido o sin permisos). Las llamadas sin la firma de Meta reciben `403`.
- **No llegan los avisos**: la persona escribió hace más de 24 horas (se registran como
  `outside_window`); usa el botón del panel.
- **Apagarlo**: `WHATSAPP_DELIVERY=disabled` y reinicia. El número sigue recibiendo mensajes en
  Meta, pero la plataforma no responde.

Los mensajes se guardan 90 días (para soporte y para no responder dos veces) y cada chat se borra
al año sin mensajes ([conservación](../legal/conservacion-y-borrado.md)).

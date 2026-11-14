import {
  formatMoney,
  normalizeWhatsapp,
  TRANSPORT_MODE_LABELS,
  vehicleName,
  whatsappLink,
  type AssistedTaxiRide,
} from '@vtp/shared-types';

/**
 * What staff send the customer on WhatsApp at each step of a ride asked for them (ADR-035): the
 * tracking link first, the plate once a driver takes it, the rating link at the end. Spanish, the
 * language of the chat. Staff press the link and WhatsApp opens with the text typed.
 */
export function customerMessage(assisted: AssistedTaxiRide, trackingUrl: string): string {
  const { ride, customer } = assisted;
  const name = customer.name;
  const kind = `viaje en ${TRANSPORT_MODE_LABELS[ride.mode].toLowerCase()}`;
  switch (ride.status) {
    case 'requested':
      return `Hola ${name}, ya pedimos tu ${kind}. Te avisamos cuando un conductor lo tome. Puedes seguirlo aquí: ${trackingUrl}`;
    case 'accepted': {
      const parts = [
        ride.vehicle ? `placa ${vehicleName(ride.vehicle)}` : null,
        ride.driver?.firstName ? `conductor ${ride.driver.firstName}` : null,
        ride.fare ? `tarifa ${formatMoney(ride.fare.amount, ride.fare.currency)}` : null,
      ].filter(Boolean);
      return `Hola ${name}, tu ${kind} va en camino: ${parts.join(', ')}. Revisa la placa antes de subir. Síguelo aquí: ${trackingUrl}`;
    }
    case 'in_progress':
      return `Buen viaje, ${name}. Al llegar paga al conductor la tarifa acordada.`;
    case 'completed':
      return `Gracias por viajar con nosotros, ${name}. ¿Cómo te fue? Califica el viaje aquí (1 a 5 estrellas): ${trackingUrl}`;
    case 'expired':
      return `Disculpa, ${name}: ningún conductor tomó tu ${kind} a tiempo. ¿Quieres que lo pidamos de nuevo?`;
    case 'cancelled':
      return `Hola ${name}, tu ${kind} quedó cancelado. Si lo necesitas otra vez, escríbenos.`;
  }
}

/** The wa.me link with that message, or null when the phone can't be used on WhatsApp. */
export function customerWhatsappLink(
  assisted: AssistedTaxiRide,
  trackingUrl: string,
): string | null {
  const phone = normalizeWhatsapp(assisted.customer.phone);
  return phone ? whatsappLink(phone, customerMessage(assisted, trackingUrl)) : null;
}

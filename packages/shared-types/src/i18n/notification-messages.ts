import { DEFAULT_LOCALE, type Locale } from './locales.js';

/**
 * Texts of push notifications and e-mails sent by the API. Spanish is the source; the others must
 * match its keys. Amounts and dates come already formatted for the recipient's language.
 */

/** A push notification (`title` + `body`) or an e-mail (`title` is the subject). */
export interface NotificationText {
  title: string;
  body: string;
}

export interface NotificationMessages {
  otp: (code: string, minutes: number) => NotificationText;
  paymentConfirmed: (bookingCode: string, route: string, departs: string) => NotificationText;
  bookingCancelled: (bookingCode: string, refund: string | null) => NotificationText;
  refundSent: (bookingCode: string, amount: string, reference: string) => NotificationText;
  tripReminder: (route: string, departs: string, from: string) => NotificationText;
  tripAssigned: (route: string, departs: string, plate: string | null) => NotificationText;
  taxiAccepted: (plate: string, fare: string) => NotificationText;
  taxiRequested: (terminal: string, passengers: number) => NotificationText;
  /** To the owners of an organization the platform approved, rejected or suspended. */
  organizationReviewed: (
    organization: string,
    decision: 'approve' | 'reject' | 'suspend',
    notes: string | null,
  ) => NotificationText;
  /** To the applicant, about their verification (KYC). */
  applicationReviewed: (
    status: 'approved' | 'rejected' | 'changes_requested',
    notes: string | null,
  ) => NotificationText;
  /** To an approved applicant, when the organization they chose takes them or not. */
  applicationDecided: (organization: string, accepted: boolean) => NotificationText;
  /** To the invited e-mail (or the person who already has it verified). */
  invitationReceived: (organization: string) => NotificationText;
  /** (manual payments) Staff did not find the money the payer reported. */
  paymentRejected: (bookingCode: string, reason: string) => NotificationText;
  /** Appended to every e-mail. */
  footer: string;
}

const es: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Tu código de VTP: ${code}`,
    body: `Tu código para entrar en VTP es ${code}. Vence en ${minutes} minutos. Si no lo pediste, ignora este correo; nadie de VTP te lo pedirá nunca.`,
  }),
  paymentConfirmed: (code, route, departs) => ({
    title: 'Pago confirmado',
    body: `Tu reserva ${code} (${route}, ${departs}) está pagada. Muestra el código QR de cada pasajero al abordar.`,
  }),
  bookingCancelled: (code, refund) => ({
    title: 'Reserva cancelada',
    body: refund
      ? `Cancelaste la reserva ${code}. Te devolveremos ${refund} por el mismo medio con el que pagaste.`
      : `Cancelaste la reserva ${code}. Según la política de cancelación no corresponde reembolso.`,
  }),
  refundSent: (code, amount, reference) => ({
    title: 'Te devolvimos tu dinero',
    body: `Te devolvimos ${amount} de la reserva ${code}. Referencia de la devolución: ${reference}.`,
  }),
  tripReminder: (route, departs, from) => ({
    title: 'Tu viaje es hoy',
    body: `${route}: sales ${departs} desde ${from}. Llega con tiempo y ten listo tu código QR.`,
  }),
  tripAssigned: (route, departs, plate) => ({
    title: 'Te asignaron un viaje',
    body: `${route}, ${departs}${plate ? ` · unidad ${plate}` : ''}. Revisa la lista de pasajeros en la app.`,
  }),
  taxiAccepted: (plate, fare) => ({
    title: 'Tu taxi va en camino',
    body: `Un taxi aceptó tu solicitud: placa ${plate}, tarifa ${fare}. Págale al conductor.`,
  }),
  taxiRequested: (terminal, passengers) => ({
    title: 'Nueva solicitud de taxi',
    body: `${terminal}: ${passengers} ${passengers === 1 ? 'pasajero' : 'pasajeros'}. La primera línea que la tome se la lleva.`,
  }),
  organizationReviewed: (organization, decision, notes) =>
    decision === 'approve'
      ? {
          title: 'Tu empresa fue aprobada',
          body: `${organization} ya está activa en VTP. Entra en el portal para cargar sus rutas, horarios y equipo.`,
        }
      : {
          title: decision === 'reject' ? 'Tu empresa no fue aprobada' : 'Tu empresa fue suspendida',
          body: `${organization}: ${notes ?? ''} Si tienes dudas, responde a soporte de VTP.`.trim(),
        },
  applicationReviewed: (status, notes) =>
    status === 'approved'
      ? {
          title: 'Verificamos tu identidad',
          body: 'Tu solicitud fue aprobada. Ahora la empresa que elegiste decide si te suma a su equipo.',
        }
      : status === 'changes_requested'
        ? {
            title: 'Tu solicitud necesita cambios',
            body: `${notes ?? ''} Corrígela en la app VTP Transporte y envíala de nuevo.`.trim(),
          }
        : {
            title: 'Tu solicitud no fue aprobada',
            body: notes ?? 'Revisa el detalle en la app VTP Transporte.',
          },
  applicationDecided: (organization, accepted) =>
    accepted
      ? {
          title: 'Ya eres parte del equipo',
          body: `${organization} te sumó a su equipo. Entra en la app VTP Transporte para ver tus viajes.`,
        }
      : {
          title: 'La empresa no te sumó',
          body: `${organization} no aceptó tu solicitud esta vez.`,
        },
  invitationReceived: (organization) => ({
    title: `${organization} te invitó a VTP`,
    body: `${organization} te invitó a su equipo. Entra en VTP con este correo o teléfono para aceptar la invitación; vence en 7 días.`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'No encontramos tu pago',
    body: `Reserva ${code}: ${reason} Revisa los datos y vuelve a intentarlo desde la app.`,
  }),
  footer: 'VTP · Transporte terrestre en Venezuela. Este es un mensaje automático.',
};

const en: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Your VTP code: ${code}`,
    body: `Your code to sign in to VTP is ${code}. It expires in ${minutes} minutes. If you did not ask for it, ignore this e-mail; VTP will never ask you for it.`,
  }),
  paymentConfirmed: (code, route, departs) => ({
    title: 'Payment confirmed',
    body: `Your booking ${code} (${route}, ${departs}) is paid. Show each passenger's QR code when boarding.`,
  }),
  bookingCancelled: (code, refund) => ({
    title: 'Booking cancelled',
    body: refund
      ? `You cancelled booking ${code}. We will refund ${refund} the same way you paid.`
      : `You cancelled booking ${code}. Under the cancellation policy no refund is due.`,
  }),
  refundSent: (code, amount, reference) => ({
    title: 'We refunded your money',
    body: `We refunded ${amount} for booking ${code}. Refund reference: ${reference}.`,
  }),
  tripReminder: (route, departs, from) => ({
    title: 'Your trip is today',
    body: `${route}: you leave ${departs} from ${from}. Arrive early and have your QR code ready.`,
  }),
  tripAssigned: (route, departs, plate) => ({
    title: 'You have a new trip',
    body: `${route}, ${departs}${plate ? ` · vehicle ${plate}` : ''}. Check the passenger list in the app.`,
  }),
  taxiAccepted: (plate, fare) => ({
    title: 'Your taxi is on its way',
    body: `A taxi accepted your request: plate ${plate}, fare ${fare}. Pay the driver.`,
  }),
  taxiRequested: (terminal, passengers) => ({
    title: 'New taxi request',
    body: `${terminal}: ${passengers} ${passengers === 1 ? 'passenger' : 'passengers'}. The first company to take it gets it.`,
  }),
  organizationReviewed: (organization, decision, notes) =>
    decision === 'approve'
      ? {
          title: 'Your company was approved',
          body: `${organization} is now active on VTP. Open the portal to add its routes, schedules and team.`,
        }
      : {
          title:
            decision === 'reject' ? 'Your company was not approved' : 'Your company was suspended',
          body: `${organization}: ${notes ?? ''} If you have questions, reply to VTP support.`.trim(),
        },
  applicationReviewed: (status, notes) =>
    status === 'approved'
      ? {
          title: 'We verified your identity',
          body: 'Your application was approved. Now the company you chose decides whether to add you to its team.',
        }
      : status === 'changes_requested'
        ? {
            title: 'Your application needs changes',
            body: `${notes ?? ''} Fix it in the VTP Transport app and send it again.`.trim(),
          }
        : {
            title: 'Your application was not approved',
            body: notes ?? 'See the details in the VTP Transport app.',
          },
  applicationDecided: (organization, accepted) =>
    accepted
      ? {
          title: 'You are on the team',
          body: `${organization} added you to its team. Open the VTP Transport app to see your trips.`,
        }
      : {
          title: 'The company did not add you',
          body: `${organization} did not accept your application this time.`,
        },
  invitationReceived: (organization) => ({
    title: `${organization} invited you to VTP`,
    body: `${organization} invited you to its team. Sign in to VTP with this e-mail or phone to accept; the invitation expires in 7 days.`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'We could not find your payment',
    body: `Booking ${code}: ${reason} Check the details and try again from the app.`,
  }),
  footer: 'VTP · Ground transport in Venezuela. This is an automatic message.',
};

const ptBR: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Seu código VTP: ${code}`,
    body: `Seu código para entrar no VTP é ${code}. Ele vence em ${minutes} minutos. Se você não pediu, ignore este e-mail; o VTP nunca vai pedi-lo a você.`,
  }),
  paymentConfirmed: (code, route, departs) => ({
    title: 'Pagamento confirmado',
    body: `Sua reserva ${code} (${route}, ${departs}) está paga. Mostre o QR code de cada passageiro ao embarcar.`,
  }),
  bookingCancelled: (code, refund) => ({
    title: 'Reserva cancelada',
    body: refund
      ? `Você cancelou a reserva ${code}. Vamos devolver ${refund} pelo mesmo meio do pagamento.`
      : `Você cancelou a reserva ${code}. Pela política de cancelamento não há reembolso.`,
  }),
  refundSent: (code, amount, reference) => ({
    title: 'Devolvemos seu dinheiro',
    body: `Devolvemos ${amount} da reserva ${code}. Referência da devolução: ${reference}.`,
  }),
  tripReminder: (route, departs, from) => ({
    title: 'Sua viagem é hoje',
    body: `${route}: você sai ${departs} de ${from}. Chegue com antecedência e tenha seu QR code à mão.`,
  }),
  tripAssigned: (route, departs, plate) => ({
    title: 'Você recebeu uma viagem',
    body: `${route}, ${departs}${plate ? ` · veículo ${plate}` : ''}. Veja a lista de passageiros no app.`,
  }),
  taxiAccepted: (plate, fare) => ({
    title: 'Seu táxi está a caminho',
    body: `Um táxi aceitou seu pedido: placa ${plate}, tarifa ${fare}. Pague ao motorista.`,
  }),
  taxiRequested: (terminal, passengers) => ({
    title: 'Novo pedido de táxi',
    body: `${terminal}: ${passengers} ${passengers === 1 ? 'passageiro' : 'passageiros'}. A primeira cooperativa que aceitar leva.`,
  }),
  organizationReviewed: (organization, decision, notes) =>
    decision === 'approve'
      ? {
          title: 'Sua empresa foi aprovada',
          body: `${organization} já está ativa no VTP. Entre no portal para cadastrar rotas, horários e equipe.`,
        }
      : {
          title:
            decision === 'reject' ? 'Sua empresa não foi aprovada' : 'Sua empresa foi suspensa',
          body: `${organization}: ${notes ?? ''} Em caso de dúvidas, responda ao suporte do VTP.`.trim(),
        },
  applicationReviewed: (status, notes) =>
    status === 'approved'
      ? {
          title: 'Verificamos sua identidade',
          body: 'Sua solicitação foi aprovada. Agora a empresa que você escolheu decide se você entra na equipe.',
        }
      : status === 'changes_requested'
        ? {
            title: 'Sua solicitação precisa de ajustes',
            body: `${notes ?? ''} Corrija no app VTP Transporte e envie de novo.`.trim(),
          }
        : {
            title: 'Sua solicitação não foi aprovada',
            body: notes ?? 'Veja os detalhes no app VTP Transporte.',
          },
  applicationDecided: (organization, accepted) =>
    accepted
      ? {
          title: 'Você entrou na equipe',
          body: `${organization} adicionou você à equipe. Abra o app VTP Transporte para ver suas viagens.`,
        }
      : {
          title: 'A empresa não adicionou você',
          body: `${organization} não aceitou sua solicitação desta vez.`,
        },
  invitationReceived: (organization) => ({
    title: `${organization} convidou você para o VTP`,
    body: `${organization} convidou você para a equipe. Entre no VTP com este e-mail ou telefone para aceitar; o convite vence em 7 dias.`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'Não encontramos seu pagamento',
    body: `Reserva ${code}: ${reason} Confira os dados e tente de novo pelo app.`,
  }),
  footer: 'VTP · Transporte rodoviário na Venezuela. Esta é uma mensagem automática.',
};

export const NOTIFICATION_MESSAGES: Record<Locale, NotificationMessages> = {
  es,
  en,
  'pt-BR': ptBR,
};

export function notificationMessages(locale: Locale | null | undefined): NotificationMessages {
  return NOTIFICATION_MESSAGES[locale ?? DEFAULT_LOCALE];
}

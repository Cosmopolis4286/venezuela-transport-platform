import type { VehicleDocumentKind } from '../api/fleet.js';
import type { RenewableDocumentKind } from '../api/onboarding.js';
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
  /** The code to choose a new password. */
  passwordReset: (code: string, minutes: number) => NotificationText;
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
  /** A trip pack was paid: its trips, its stretch and until when it lasts. */
  tripPackActivated: (
    code: string,
    trips: number,
    stretch: string,
    expires: string,
  ) => NotificationText;
  tripPackPaymentRejected: (code: string, reason: string) => NotificationText;
  /** A pack with trips left expires soon (`TRIP_PACK_EXPIRY_NOTICE_DAYS`); unused trips are lost. */
  tripPackExpiring: (code: string, remaining: number, expires: string) => NotificationText;
  /** The operator cancelled the departure; `refund` is the formatted amount, or null if unpaid. */
  departureCancelled: (
    bookingCode: string,
    route: string,
    departs: string,
    reason: string,
    refund: string | null,
  ) => NotificationText;
  /** A driver's document expires on `date` (or already did): renew it (ADR-042). */
  documentExpiring: (
    kind: RenewableDocumentKind,
    date: string,
    expired: boolean,
  ) => NotificationText;
  /** To a line's managers: a paper of one of their vehicles expires on `date` (or did). */
  vehicleDocumentExpiring: (
    plate: string,
    kind: VehicleDocumentKind,
    date: string,
    expired: boolean,
  ) => NotificationText;
  /** Platform staff accepted or rejected a renewed document. */
  documentRenewalReviewed: (
    kind: RenewableDocumentKind,
    accepted: boolean,
    reason: string | null,
  ) => NotificationText;
  /** To the platform team: someone pressed the emergency button in a ride (ADR-043). */
  safetyAlert: (reporter: 'passenger' | 'driver', plate: string, route: string) => NotificationText;
  /** Appended to every e-mail. */
  footer: string;
}

const DOCUMENT_NAMES: Record<
  Locale,
  Record<RenewableDocumentKind | VehicleDocumentKind, string>
> = {
  es: {
    driver_license: 'licencia de conducir',
    medical_certificate: 'certificado médico',
    liability_insurance: 'póliza RCV',
    registration: 'certificado de circulación',
    insurance: 'póliza de seguro (RCV)',
    transport_permit: 'permiso de transporte',
  },
  en: {
    driver_license: 'driving licence',
    medical_certificate: 'medical certificate',
    liability_insurance: 'liability insurance (RCV)',
    registration: 'vehicle registration',
    insurance: 'insurance policy (RCV)',
    transport_permit: 'transport permit',
  },
  'pt-BR': {
    driver_license: 'carteira de motorista',
    medical_certificate: 'atestado médico',
    liability_insurance: 'seguro de responsabilidade civil (RCV)',
    registration: 'documento do veículo',
    insurance: 'apólice de seguro (RCV)',
    transport_permit: 'licença de transporte',
  },
};

const es: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Tu código de VTP: ${code}`,
    body: `Tu código para entrar en VTP es ${code}. Vence en ${minutes} minutos. Si no lo pediste, ignora este correo; nadie de VTP te lo pedirá nunca.`,
  }),
  passwordReset: (code, minutes) => ({
    title: `Código para cambiar tu contraseña de VTP: ${code}`,
    body: `Usa el código ${code} para elegir una contraseña nueva. Vence en ${minutes} minutos. Si no lo pediste, ignora este correo: tu contraseña no cambia.`,
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
  departureCancelled: (code, route, departs, reason, refund) => ({
    title: 'La empresa canceló tu viaje',
    body: `${route}, ${departs} (reserva ${code}): ${reason} ${refund ? `Te devolveremos ${refund} completo por el mismo medio con el que pagaste.` : 'Tus puestos se liberaron.'}`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'No encontramos tu pago',
    body: `Reserva ${code}: ${reason} Revisa los datos y vuelve a intentarlo desde la app.`,
  }),
  tripPackExpiring: (code, remaining, expires) => ({
    title: 'Tu paquete está por vencer',
    body: `A tu paquete ${code} le quedan ${remaining} ${remaining === 1 ? 'viaje' : 'viajes'} y vence el ${expires}. Los viajes sin usar se pierden: resérvalos en la app.`,
  }),
  tripPackActivated: (code, trips, stretch, expires) => ({
    title: 'Paquete activado',
    body: `Tu paquete ${code} (${trips} viajes, ${stretch}) está pagado y vence el ${expires}. Úsalo al reservar en la app.`,
  }),
  tripPackPaymentRejected: (code, reason) => ({
    title: 'No encontramos tu pago',
    body: `Paquete ${code}: ${reason} Revisa los datos y vuelve a intentarlo desde la app.`,
  }),
  documentExpiring: (kind, date, expired) => {
    const name = DOCUMENT_NAMES.es[kind];
    return expired
      ? {
          title: `Tu ${name} venció`,
          body: `Tu ${name} venció el ${date}. Sube la copia vigente en Conduce con VTP; ${kind === 'liability_insurance' ? 'hasta que la aprobemos, tu vehículo no puede tomar viajes' : 'hasta que la aprobemos, no puedes conectarte'}.`,
        }
      : {
          title: `Tu ${name} vence pronto`,
          body: `Tu ${name} vence el ${date}. Sube la copia nueva en Conduce con VTP antes de esa fecha para seguir recibiendo viajes.`,
        };
  },
  vehicleDocumentExpiring: (plate, kind, date, expired) => {
    const name = DOCUMENT_NAMES.es[kind];
    return {
      title: expired ? `Venció un documento de ${plate}` : `Vence un documento de ${plate}`,
      body: `Vehículo ${plate}: ${name} ${expired ? 'vencido' : 'por vencer'} (${date}). Actualízalo en el portal, en Flota${kind === 'insurance' ? ': sin póliza vigente el vehículo no toma viajes' : ''}.`,
    };
  },
  documentRenewalReviewed: (kind, accepted, reason) => {
    const name = DOCUMENT_NAMES.es[kind];
    return accepted
      ? {
          title: 'Documento aprobado',
          body: `Aprobamos la copia nueva de tu ${name}. Ya está al día.`,
        }
      : {
          title: 'Revisa tu documento',
          body: `No pudimos aprobar la copia nueva de tu ${name}: ${reason ?? 'no es válida'}. Sube otra en Conduce con VTP.`,
        };
  },
  safetyAlert: (reporter, plate, route) => ({
    title: '🚨 Emergencia en un viaje',
    body: `${reporter === 'driver' ? 'El conductor' : 'El pasajero'} del viaje ${plate} (${route}) tocó Emergencia. Atiéndelo ya en el portal, en Emergencias.`,
  }),
  footer: 'VTP · Transporte terrestre en Venezuela. Este es un mensaje automático.',
};

const en: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Your VTP code: ${code}`,
    body: `Your code to sign in to VTP is ${code}. It expires in ${minutes} minutes. If you did not ask for it, ignore this e-mail; VTP will never ask you for it.`,
  }),
  passwordReset: (code, minutes) => ({
    title: `Code to change your VTP password: ${code}`,
    body: `Use the code ${code} to choose a new password. It expires in ${minutes} minutes. If you did not ask for it, ignore this e-mail: your password does not change.`,
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
  departureCancelled: (code, route, departs, reason, refund) => ({
    title: 'The company cancelled your trip',
    body: `${route}, ${departs} (booking ${code}): ${reason} ${refund ? `We will refund ${refund} in full the same way you paid.` : 'Your seats were released.'}`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'We could not find your payment',
    body: `Booking ${code}: ${reason} Check the details and try again from the app.`,
  }),
  tripPackExpiring: (code, remaining, expires) => ({
    title: 'Your trip pack expires soon',
    body: `Your trip pack ${code} has ${remaining} ${remaining === 1 ? 'trip' : 'trips'} left and expires on ${expires}. Unused trips are lost: book them in the app.`,
  }),
  tripPackActivated: (code, trips, stretch, expires) => ({
    title: 'Trip pack activated',
    body: `Your trip pack ${code} (${trips} trips, ${stretch}) is paid and expires on ${expires}. Use it when booking in the app.`,
  }),
  tripPackPaymentRejected: (code, reason) => ({
    title: 'We could not find your payment',
    body: `Trip pack ${code}: ${reason} Check the details and try again from the app.`,
  }),
  documentExpiring: (kind, date, expired) => {
    const name = DOCUMENT_NAMES.en[kind];
    return expired
      ? {
          title: `Your ${name} expired`,
          body: `Your ${name} expired on ${date}. Upload a current one in Drive with VTP; ${kind === 'liability_insurance' ? 'until we approve it, your vehicle cannot take rides' : 'until we approve it, you cannot go online'}.`,
        }
      : {
          title: `Your ${name} expires soon`,
          body: `Your ${name} expires on ${date}. Upload the new one in Drive with VTP before then to keep getting rides.`,
        };
  },
  vehicleDocumentExpiring: (plate, kind, date, expired) => {
    const name = DOCUMENT_NAMES.en[kind];
    return {
      title: expired ? `A document of ${plate} expired` : `A document of ${plate} expires soon`,
      body: `The ${name} of vehicle ${plate} ${expired ? 'expired' : 'expires'} on ${date}. Update it in the portal, under Fleet${kind === 'insurance' ? ': without a current policy the vehicle takes no rides' : ''}.`,
    };
  },
  documentRenewalReviewed: (kind, accepted, reason) => {
    const name = DOCUMENT_NAMES.en[kind];
    return accepted
      ? { title: 'Document approved', body: `We approved your new ${name}. You are up to date.` }
      : {
          title: 'Check your document',
          body: `We could not approve your new ${name}: ${reason ?? 'it is not valid'}. Upload another one in Drive with VTP.`,
        };
  },
  safetyAlert: (reporter, plate, route) => ({
    title: '🚨 Emergency on a ride',
    body: `The ${reporter === 'driver' ? 'driver' : 'passenger'} of ride ${plate} (${route}) pressed Emergency. Attend to it now in the portal, under Emergencies.`,
  }),
  footer: 'VTP · Ground transport in Venezuela. This is an automatic message.',
};

const ptBR: NotificationMessages = {
  otp: (code, minutes) => ({
    title: `Seu código VTP: ${code}`,
    body: `Seu código para entrar no VTP é ${code}. Ele vence em ${minutes} minutos. Se você não pediu, ignore este e-mail; o VTP nunca vai pedi-lo a você.`,
  }),
  passwordReset: (code, minutes) => ({
    title: `Código para trocar sua senha do VTP: ${code}`,
    body: `Use o código ${code} para escolher uma nova senha. Ele vence em ${minutes} minutos. Se você não pediu, ignore este e-mail: sua senha não muda.`,
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
  departureCancelled: (code, route, departs, reason, refund) => ({
    title: 'A empresa cancelou sua viagem',
    body: `${route}, ${departs} (reserva ${code}): ${reason} ${refund ? `Vamos devolver ${refund} integralmente pelo mesmo meio do pagamento.` : 'Seus assentos foram liberados.'}`,
  }),
  paymentRejected: (code, reason) => ({
    title: 'Não encontramos seu pagamento',
    body: `Reserva ${code}: ${reason} Confira os dados e tente de novo pelo app.`,
  }),
  tripPackExpiring: (code, remaining, expires) => ({
    title: 'Seu pacote está vencendo',
    body: `Seu pacote ${code} tem ${remaining} ${remaining === 1 ? 'viagem' : 'viagens'} e vence em ${expires}. Viagens não usadas se perdem: reserve-as no app.`,
  }),
  tripPackActivated: (code, trips, stretch, expires) => ({
    title: 'Pacote ativado',
    body: `Seu pacote ${code} (${trips} viagens, ${stretch}) está pago e vence em ${expires}. Use-o ao reservar no app.`,
  }),
  tripPackPaymentRejected: (code, reason) => ({
    title: 'Não encontramos seu pagamento',
    body: `Pacote ${code}: ${reason} Revise os dados e tente novamente pelo app.`,
  }),
  documentExpiring: (kind, date, expired) => {
    const name = DOCUMENT_NAMES['pt-BR'][kind];
    return expired
      ? {
          title: `Documento vencido: ${name}`,
          body: `O documento (${name}) venceu em ${date}. Envie uma cópia válida em Dirija com a VTP; ${kind === 'liability_insurance' ? 'até aprovarmos, seu veículo não pode aceitar viagens' : 'até aprovarmos, você não pode ficar online'}.`,
        }
      : {
          title: `Documento vencendo: ${name}`,
          body: `O documento (${name}) vence em ${date}. Envie a cópia nova em Dirija com a VTP antes dessa data para continuar recebendo viagens.`,
        };
  },
  vehicleDocumentExpiring: (plate, kind, date, expired) => {
    const name = DOCUMENT_NAMES['pt-BR'][kind];
    return {
      title: expired ? `Venceu um documento de ${plate}` : `Vence um documento de ${plate}`,
      body: `Veículo ${plate}: ${name} ${expired ? 'vencido' : 'vencendo'} (${date}). Atualize-o no portal, em Frota${kind === 'insurance' ? ': sem apólice válida o veículo não aceita viagens' : ''}.`,
    };
  },
  documentRenewalReviewed: (kind, accepted, reason) => {
    const name = DOCUMENT_NAMES['pt-BR'][kind];
    return accepted
      ? {
          title: 'Documento aprovado',
          body: `Aprovamos a cópia nova do documento (${name}). Está tudo em dia.`,
        }
      : {
          title: 'Revise seu documento',
          body: `Não pudemos aprovar a cópia nova do documento (${name}): ${reason ?? 'não é válida'}. Envie outro em Dirija com a VTP.`,
        };
  },
  safetyAlert: (reporter, plate, route) => ({
    title: '🚨 Emergência em uma corrida',
    body: `${reporter === 'driver' ? 'O motorista' : 'O passageiro'} da corrida ${plate} (${route}) tocou em Emergência. Atenda agora no portal, em Emergências.`,
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

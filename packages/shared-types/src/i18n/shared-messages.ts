// Only type imports from ../api: those modules derive their Spanish constants from this file.
import type { BookingStatus } from '../api/bookings.js';
import type { ApiErrorCode, ApiErrorReason } from '../api/errors.js';
import type { ServiceClass, StopKind } from '../api/network.js';
import type { OrganizationType } from '../api/organizations.js';
import type { PaymentMethod, PaymentStatus } from '../api/payments.js';
import type { TaxiDirection, TaxiRideStatus } from '../api/taxi.js';
import type { Locale } from './locales.js';

/**
 * Texts every passenger-facing surface shares: statuses, labels and error messages. Spanish is
 * the source; the other languages must provide exactly the same keys (the type enforces it).
 */
export interface SharedMessages {
  stopKind: Record<StopKind, string>;
  serviceClass: Record<ServiceClass, string>;
  organizationType: Record<OrganizationType, string>;
  bookingStatus: Record<BookingStatus, string>;
  paymentMethod: Record<PaymentMethod, string>;
  paymentStatus: Record<PaymentStatus, string>;
  taxiDirection: Record<TaxiDirection, string>;
  taxiRideStatus: Record<TaxiRideStatus, string>;
  /** What the passenger should do next, by ride status. */
  taxiRideHint: Record<Exclude<TaxiRideStatus, 'accepted'>, string> & {
    acceptedFromTerminal: string;
    acceptedToTerminal: string;
  };
  /** Messages for error codes whose meaning does not depend on the request. */
  errors: Partial<Record<ApiErrorCode, string>> & { INTERNAL_ERROR: string; network: string };
  reasons: Record<ApiErrorReason, string>;
}

const es: SharedMessages = {
  stopKind: { terminal: 'Terminal', stop: 'Parada' },
  serviceClass: { standard: 'Convencional', executive: 'Ejecutivo', sleeper: 'Buscama' },
  organizationType: {
    bus_company: 'Empresa de autobuses',
    taxi_line: 'Línea de taxis',
    terminal: 'Terminal',
  },
  bookingStatus: {
    held: 'Apartada, pendiente de pago',
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    expired: 'Vencida',
  },
  paymentMethod: {
    pago_movil: 'Pago móvil',
    bank_transfer: 'Transferencia bancaria',
    pix: 'PIX',
    usdt: 'USDT',
  },
  paymentStatus: {
    pending: 'Esperando el pago',
    reported: 'Verificando el pago',
    confirmed: 'Pagado',
    rejected: 'Pago no encontrado',
    cancelled: 'Anulado',
    refund_due: 'Por reembolsar',
    refunded: 'Reembolsado',
  },
  taxiDirection: { from_terminal: 'Desde el terminal', to_terminal: 'Hacia el terminal' },
  taxiRideStatus: {
    requested: 'Buscando taxi',
    accepted: 'Taxi asignado',
    in_progress: 'En camino',
    completed: 'Terminado',
    cancelled: 'Cancelado',
    expired: 'Sin taxi disponible',
  },
  taxiRideHint: {
    requested: 'Las líneas de taxi del terminal están viendo tu solicitud.',
    acceptedFromTerminal:
      'Tu taxi va a la parada de taxis del terminal. Verifica la placa antes de subir.',
    acceptedToTerminal:
      'Tu taxi va a buscarte a la dirección que indicaste. Verifica la placa antes de subir.',
    in_progress: 'Buen viaje. Paga la tarifa acordada al conductor.',
    completed: 'Viaje terminado.',
    cancelled: 'El viaje se canceló.',
    expired: 'Ningún taxi tomó la solicitud a tiempo. Puedes pedir otro.',
  },
  errors: {
    INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
    SESSION_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
    UNAUTHORIZED: 'Inicia sesión para continuar.',
    FORBIDDEN: 'No tienes permiso para hacer esto.',
    NOT_FOUND: 'No encontramos lo que buscas.',
    OTP_INVALID: 'El código no es válido.',
    OTP_EXPIRED: 'El código expiró o hubo demasiados intentos. Pide uno nuevo.',
    RATE_LIMITED: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    SERVICE_UNAVAILABLE: 'El servicio no está disponible en este momento.',
    PAYLOAD_TOO_LARGE: 'El archivo es demasiado grande.',
    INTERNAL_ERROR: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
    network: 'No pudimos conectar con el servidor. Revisa tu conexión.',
  },
  reasons: {
    EMAIL_TAKEN: 'Ya existe una cuenta con ese correo. Inicia sesión.',
    CONTACT_TAKEN: 'Ese correo o teléfono ya pertenece a otra cuenta.',
    RELOAD_AND_RETRY: 'Los datos cambiaron mientras tanto. Recarga e inténtalo de nuevo.',
    RIF_TAKEN: 'Ya hay una organización registrada con ese RIF.',
    ALREADY_MEMBER: 'Esa persona ya es miembro de la organización.',
    LAST_OWNER: 'La organización debe conservar al menos un dueño.',
    INVITATION_PENDING: 'Ya hay una invitación pendiente para esa persona.',
    ORGANIZATION_WRONG_STATUS: 'La organización no está en un estado que permita esa acción.',
    ORGANIZATION_NOT_APPROVED: 'La organización debe estar aprobada para publicar rutas.',
    ORGANIZATION_TYPE_NOT_ALLOWED: 'Este tipo de organización no puede hacer eso.',
    APPLICATION_OPEN: 'Ya tienes una solicitud abierta.',
    APPLICATION_UNDER_REVIEW: 'Tu solicitud está en revisión y no se puede cambiar ahora.',
    APPLICATION_WRONG_STATUS: 'La solicitud no está esperando revisión.',
    STOP_NAME_TAKEN: 'Ya existe una parada con ese nombre en esa ciudad.',
    ZONE_NAME_TAKEN: 'Ya existe una zona con ese nombre o identificador.',
    ZONE_NOT_ACTIVE: 'Todavía no operamos en esa zona, o el servicio está pausado.',
    ROUTE_PUBLISHED: 'Una ruta publicada no se elimina: desactívala.',
    ROUTE_WRONG_STATUS: 'La ruta no puede pasar a ese estado.',
    ROUTE_NEEDS_SCHEDULE: 'Agrega al menos un horario activo antes de publicar la ruta.',
    ROUTE_NEEDS_FARE: 'Fija la tarifa del origen al destino final antes de publicar la ruta.',
    TOO_MANY_SCHEDULES: 'Esta ruta ya tiene el máximo de horarios.',
    SCHEDULE_HAS_BOOKINGS: 'Este horario tiene reservas: pausarlo en vez de eliminarlo.',
    LAYOUT_IN_USE:
      'Hay horarios usando este mapa de puestos. Cámbialos a otro antes de eliminarlo.',
    VEHICLE_INSURANCE_EXPIRED:
      'La póliza RCV de este vehículo está vencida para esa fecha. Actualízala en Vehículos o elige otro vehículo.',
    ACCOUNT_HAS_TRIPS:
      'Tienes viajes pagados o un taxi pendiente: cancélalos o espera a viajar antes de borrar la cuenta.',
    ACCOUNT_HAS_REFUNDS:
      'Tienes un pago en verificación o un reembolso por recibir: espera a que termine antes de borrar la cuenta.',
    ACCOUNT_OWNS_ORGANIZATION:
      'Eres el único dueño de una empresa: pasa la titularidad a otra persona antes de borrar la cuenta.',
    SEAT_TAKEN: 'Alguien acaba de apartar uno de esos puestos. Vuelve atrás y elige otro.',
    TOO_MANY_HOLDS: 'Tienes reservas sin pagar. Págalas o cancélalas antes de apartar más puestos.',
    DEPARTURE_NOT_BOOKABLE: 'Esta salida ya no se puede reservar.',
    BOOKING_NOT_AWAITING_PAYMENT: 'Esta reserva ya no está esperando el pago.',
    PAYMENT_METHOD_UNAVAILABLE: 'Ese método de pago no está disponible para esta reserva.',
    PAYMENT_UNDER_REVIEW: 'Estamos verificando el pago que reportaste; espera la respuesta.',
    PAYMENT_NOT_REPORTABLE: 'Este pago ya no se puede reportar.',
    PAYMENT_NOT_REPORTED: 'Este pago no está esperando verificación.',
    VEHICLE_PLATE_TAKEN: 'Ya tienes un vehículo con esa placa.',
    VEHICLE_INACTIVE: 'Ese vehículo está inactivo.',
    VEHICLE_LAYOUT_MISMATCH: 'Ese vehículo tiene otro mapa de puestos que esta salida.',
    VEHICLE_BUSY: 'Ese vehículo ya está en otro viaje a esa hora.',
    DRIVER_BUSY: 'Ese conductor ya está en otro viaje a esa hora.',
    TRIP_CANCELLED: 'Esta salida está cancelada.',
    TAXI_TERMINAL_NOT_SERVED: 'Ninguna línea de taxi atiende ese terminal en este momento.',
    TAXI_RIDE_OPEN: 'Ya tienes un taxi en curso. Ábrelo para ver su estado.',
    TAXI_RIDE_TAKEN: 'Otro taxi tomó la solicitud, o ya venció.',
    TAXI_RIDE_NOT_CANCELLABLE: 'Este taxi ya no se puede cancelar.',
    TAXI_RIDE_NOT_RELEASABLE: 'Solo se puede liberar un viaje que aún no ha empezado.',
    TAXI_RIDE_WRONG_STEP: 'El viaje cambió de estado. Actualiza la pantalla.',
    TAXI_LINE_INACTIVE: 'La línea de taxi no está activa.',
    NOT_A_TAXI_LINE: 'Solo las líneas de taxi atienden solicitudes de taxi.',
    COLLECTION_EXCEEDS_DEBT:
      'El cobro es mayor que lo que la empresa le debe a la plataforma en esa moneda.',
    PAYOUT_EXCEEDS_BALANCE: 'El pago es mayor que el saldo de la empresa en esa moneda.',
    PAYOUT_ALREADY_VOIDED: 'Este pago a la empresa ya fue anulado.',
    PAYMENT_NOT_REFUND_DUE: 'Este pago no está pendiente de reembolso.',
    BOOKING_NOT_CANCELLABLE: 'Esta reserva ya no se puede cancelar: el viaje salió o ya abordaste.',
    TRIP_TOO_EARLY:
      'Todavía es temprano: la salida se marca desde 2 horas antes de la hora programada.',
    TRIP_WRONG_STEP:
      'Ese paso no corresponde: primero se marca la salida y luego la llegada, una sola vez.',
    FISCAL_SETTINGS_INCOMPLETE:
      'Completa los datos fiscales (razón social, RIF y domicilio) antes de emitir.',
    BCV_RATE_MISSING: 'Falta la tasa BCV de esa fecha (o de un día anterior).',
    INVOICE_NOT_DRAFT: 'Este documento ya fue emitido o anulado.',
    INVOICE_ALREADY_VOIDED: 'Este documento ya fue anulado.',
    INVOICE_RELATED_NOT_ISSUED: 'Primero emite la factura que esta nota de crédito corrige.',
    INVOICE_NUMBER_TAKEN: 'Ya existe un documento con ese número o número de control.',
    PURCHASE_TAKEN: 'Esa factura de compra ya está registrada.',
    INVOICE_ALREADY_ISSUED: 'La factura ya fue emitida: no se puede cambiar a nombre de quién va.',
    ACCOUNT_REQUIRED:
      'Para esto necesitas crear tu cuenta (correo y contraseña). Tus viajes se conservan.',
    NOT_A_GUEST: 'Esta cuenta ya está registrada.',
  },
};

const en: SharedMessages = {
  stopKind: { terminal: 'Terminal', stop: 'Stop' },
  serviceClass: { standard: 'Standard', executive: 'Executive', sleeper: 'Sleeper' },
  organizationType: {
    bus_company: 'Bus company',
    taxi_line: 'Taxi company',
    terminal: 'Terminal',
  },
  bookingStatus: {
    held: 'On hold, awaiting payment',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    expired: 'Expired',
  },
  paymentMethod: {
    pago_movil: 'Pago Móvil (Venezuelan mobile payment)',
    bank_transfer: 'Bank transfer (Venezuela)',
    pix: 'PIX',
    usdt: 'USDT',
  },
  paymentStatus: {
    pending: 'Awaiting payment',
    reported: 'Checking the payment',
    confirmed: 'Paid',
    rejected: 'Payment not found',
    cancelled: 'Voided',
    refund_due: 'To be refunded',
    refunded: 'Refunded',
  },
  taxiDirection: { from_terminal: 'From the terminal', to_terminal: 'To the terminal' },
  taxiRideStatus: {
    requested: 'Looking for a taxi',
    accepted: 'Taxi assigned',
    in_progress: 'On the way',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'No taxi available',
  },
  taxiRideHint: {
    requested: 'The taxi companies at the terminal can see your request.',
    acceptedFromTerminal:
      'Your taxi is heading to the terminal taxi stand. Check the plate before you get in.',
    acceptedToTerminal:
      'Your taxi is on its way to the address you gave. Check the plate before you get in.',
    in_progress: 'Have a good trip. Pay the agreed fare to the driver.',
    completed: 'Ride completed.',
    cancelled: 'The ride was cancelled.',
    expired: 'No taxi took your request in time. You can ask for another one.',
  },
  errors: {
    INVALID_CREDENTIALS: 'Wrong e-mail or password.',
    SESSION_EXPIRED: 'Your session expired. Please sign in again.',
    UNAUTHORIZED: 'Sign in to continue.',
    FORBIDDEN: 'You are not allowed to do this.',
    NOT_FOUND: 'We could not find what you are looking for.',
    OTP_INVALID: 'The code is not valid.',
    OTP_EXPIRED: 'The code expired or there were too many attempts. Ask for a new one.',
    RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
    SERVICE_UNAVAILABLE: 'The service is not available right now.',
    PAYLOAD_TOO_LARGE: 'The file is too large.',
    INTERNAL_ERROR: 'Something went wrong. Please try again.',
    network: 'We could not reach the server. Check your connection.',
  },
  reasons: {
    EMAIL_TAKEN: 'An account with that e-mail already exists. Sign in.',
    CONTACT_TAKEN: 'That e-mail or phone already belongs to another account.',
    RELOAD_AND_RETRY: 'The data changed in the meantime. Reload and try again.',
    RIF_TAKEN: 'An organization with that RIF is already registered.',
    ALREADY_MEMBER: 'That person is already a member of the organization.',
    LAST_OWNER: 'The organization must keep at least one owner.',
    INVITATION_PENDING: 'That person already has a pending invitation.',
    ORGANIZATION_WRONG_STATUS: 'The organization is not in a state that allows that.',
    ORGANIZATION_NOT_APPROVED: 'The organization must be approved to publish routes.',
    ORGANIZATION_TYPE_NOT_ALLOWED: 'This kind of organization cannot do that.',
    APPLICATION_OPEN: 'You already have an open application.',
    APPLICATION_UNDER_REVIEW: 'Your application is under review and cannot be changed now.',
    APPLICATION_WRONG_STATUS: 'The application is not waiting for review.',
    STOP_NAME_TAKEN: 'A stop with that name already exists in that city.',
    ZONE_NAME_TAKEN: 'A zone with that name or identifier already exists.',
    ZONE_NOT_ACTIVE: 'We do not operate in that area yet, or service is paused.',
    ROUTE_PUBLISHED: 'A published route is not deleted: deactivate it.',
    ROUTE_WRONG_STATUS: 'The route cannot change to that status.',
    ROUTE_NEEDS_SCHEDULE: 'Add at least one active schedule before publishing the route.',
    ROUTE_NEEDS_FARE: 'Set the fare from the origin to the final destination before publishing.',
    TOO_MANY_SCHEDULES: 'This route already has the maximum number of schedules.',
    SCHEDULE_HAS_BOOKINGS: 'This schedule has bookings: pause it instead of deleting it.',
    LAYOUT_IN_USE: 'Schedules use this seat map. Move them to another one before deleting it.',
    VEHICLE_INSURANCE_EXPIRED:
      "This vehicle's liability insurance (RCV) is expired on that date. Update it or choose another vehicle.",
    ACCOUNT_HAS_TRIPS:
      'You have paid trips or a pending taxi: cancel them or travel first, then delete the account.',
    ACCOUNT_HAS_REFUNDS:
      'You have a payment being checked or a refund on its way: wait until it finishes to delete the account.',
    ACCOUNT_OWNS_ORGANIZATION:
      'You are the only owner of a company: hand ownership to someone else before deleting the account.',
    SEAT_TAKEN: 'Someone just held one of those seats. Go back and choose another.',
    TOO_MANY_HOLDS: 'You have unpaid bookings. Pay or cancel them before holding more seats.',
    DEPARTURE_NOT_BOOKABLE: 'This departure can no longer be booked.',
    BOOKING_NOT_AWAITING_PAYMENT: 'This booking is no longer waiting for payment.',
    PAYMENT_METHOD_UNAVAILABLE: 'That payment method is not available for this booking.',
    PAYMENT_UNDER_REVIEW: 'We are checking the payment you reported; please wait for the answer.',
    PAYMENT_NOT_REPORTABLE: 'This payment can no longer be reported.',
    PAYMENT_NOT_REPORTED: 'This payment is not waiting for verification.',
    VEHICLE_PLATE_TAKEN: 'You already have a vehicle with that plate.',
    VEHICLE_INACTIVE: 'That vehicle is inactive.',
    VEHICLE_LAYOUT_MISMATCH: 'That vehicle has a different seat map than this departure.',
    VEHICLE_BUSY: 'That vehicle is already on another trip at that time.',
    DRIVER_BUSY: 'That driver is already on another trip at that time.',
    TRIP_CANCELLED: 'This departure is cancelled.',
    TAXI_TERMINAL_NOT_SERVED: 'No taxi company serves that terminal right now.',
    TAXI_RIDE_OPEN: 'You already have a taxi on the way. Open it to see its status.',
    TAXI_RIDE_TAKEN: 'Another taxi took the request, or it expired.',
    TAXI_RIDE_NOT_CANCELLABLE: 'This taxi can no longer be cancelled.',
    TAXI_RIDE_NOT_RELEASABLE: 'Only a ride that has not started can be released.',
    TAXI_RIDE_WRONG_STEP: 'The ride changed. Refresh the screen.',
    TAXI_LINE_INACTIVE: 'The taxi company is not active.',
    NOT_A_TAXI_LINE: 'Only taxi companies take taxi requests.',
    COLLECTION_EXCEEDS_DEBT:
      'The amount is larger than what the company owes the platform in that currency.',
    PAYOUT_EXCEEDS_BALANCE: "The payout is larger than the company's balance in that currency.",
    PAYOUT_ALREADY_VOIDED: 'This payout was already voided.',
    PAYMENT_NOT_REFUND_DUE: 'This payment is not awaiting a refund.',
    BOOKING_NOT_CANCELLABLE:
      'This booking can no longer be cancelled: the bus left or you boarded.',
    TRIP_TOO_EARLY:
      'Too early: the departure can be marked from 2 hours before the scheduled time.',
    TRIP_WRONG_STEP:
      'That step does not apply: mark the departure first, then the arrival, once each.',
    FISCAL_SETTINGS_INCOMPLETE:
      'Fill in the fiscal details (legal name, RIF and address) before issuing.',
    BCV_RATE_MISSING: 'The BCV rate for that date (or an earlier day) is missing.',
    INVOICE_NOT_DRAFT: 'This document was already issued or voided.',
    INVOICE_ALREADY_VOIDED: 'This document was already voided.',
    INVOICE_RELATED_NOT_ISSUED: 'Issue the invoice this credit note corrects first.',
    INVOICE_NUMBER_TAKEN: 'A document with that number or control number already exists.',
    PURCHASE_TAKEN: 'That purchase invoice is already recorded.',
    INVOICE_ALREADY_ISSUED: 'The invoice was already issued: its name can no longer change.',
    ACCOUNT_REQUIRED:
      'For this you need to create your account (e-mail and password). Your trips are kept.',
    NOT_A_GUEST: 'This account is already registered.',
  },
};

const ptBR: SharedMessages = {
  stopKind: { terminal: 'Terminal', stop: 'Parada' },
  serviceClass: { standard: 'Convencional', executive: 'Executivo', sleeper: 'Leito' },
  organizationType: {
    bus_company: 'Empresa de ônibus',
    taxi_line: 'Cooperativa de táxi',
    terminal: 'Terminal',
  },
  bookingStatus: {
    held: 'Reservada, aguardando pagamento',
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    expired: 'Expirada',
  },
  paymentMethod: {
    pago_movil: 'Pago Móvil (pagamento móvel venezuelano)',
    bank_transfer: 'Transferência bancária (Venezuela)',
    pix: 'PIX',
    usdt: 'USDT',
  },
  paymentStatus: {
    pending: 'Aguardando pagamento',
    reported: 'Verificando o pagamento',
    confirmed: 'Pago',
    rejected: 'Pagamento não encontrado',
    cancelled: 'Anulado',
    refund_due: 'A reembolsar',
    refunded: 'Reembolsado',
  },
  taxiDirection: { from_terminal: 'Saindo do terminal', to_terminal: 'Indo para o terminal' },
  taxiRideStatus: {
    requested: 'Procurando táxi',
    accepted: 'Táxi a caminho',
    in_progress: 'Em viagem',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    expired: 'Nenhum táxi disponível',
  },
  taxiRideHint: {
    requested: 'As cooperativas de táxi do terminal estão vendo o seu pedido.',
    acceptedFromTerminal:
      'Seu táxi está indo para o ponto de táxi do terminal. Confira a placa antes de entrar.',
    acceptedToTerminal:
      'Seu táxi está indo buscar você no endereço informado. Confira a placa antes de entrar.',
    in_progress: 'Boa viagem. Pague a tarifa combinada ao motorista.',
    completed: 'Viagem concluída.',
    cancelled: 'A viagem foi cancelada.',
    expired: 'Nenhum táxi aceitou o pedido a tempo. Você pode pedir outro.',
  },
  errors: {
    INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
    SESSION_EXPIRED: 'Sua sessão expirou. Entre novamente.',
    UNAUTHORIZED: 'Entre para continuar.',
    FORBIDDEN: 'Você não tem permissão para fazer isso.',
    NOT_FOUND: 'Não encontramos o que você procura.',
    OTP_INVALID: 'O código não é válido.',
    OTP_EXPIRED: 'O código expirou ou houve tentativas demais. Peça um novo.',
    RATE_LIMITED: 'Tentativas demais. Aguarde um momento e tente novamente.',
    SERVICE_UNAVAILABLE: 'O serviço não está disponível no momento.',
    PAYLOAD_TOO_LARGE: 'O arquivo é grande demais.',
    INTERNAL_ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
    network: 'Não conseguimos conectar ao servidor. Verifique sua conexão.',
  },
  reasons: {
    EMAIL_TAKEN: 'Já existe uma conta com esse e-mail. Entre.',
    CONTACT_TAKEN: 'Esse e-mail ou telefone já pertence a outra conta.',
    RELOAD_AND_RETRY: 'Os dados mudaram nesse meio-tempo. Recarregue e tente de novo.',
    RIF_TAKEN: 'Já existe uma organização registrada com esse RIF.',
    ALREADY_MEMBER: 'Essa pessoa já é membro da organização.',
    LAST_OWNER: 'A organização deve manter pelo menos um dono.',
    INVITATION_PENDING: 'Essa pessoa já tem um convite pendente.',
    ORGANIZATION_WRONG_STATUS: 'A organização não está em um estado que permita isso.',
    ORGANIZATION_NOT_APPROVED: 'A organização deve estar aprovada para publicar rotas.',
    ORGANIZATION_TYPE_NOT_ALLOWED: 'Este tipo de organização não pode fazer isso.',
    APPLICATION_OPEN: 'Você já tem uma solicitação aberta.',
    APPLICATION_UNDER_REVIEW: 'Sua solicitação está em análise e não pode ser alterada agora.',
    APPLICATION_WRONG_STATUS: 'A solicitação não está aguardando análise.',
    STOP_NAME_TAKEN: 'Já existe uma parada com esse nome nessa cidade.',
    ZONE_NAME_TAKEN: 'Já existe uma zona com esse nome ou identificador.',
    ZONE_NOT_ACTIVE: 'Ainda não operamos nessa região, ou o serviço está pausado.',
    ROUTE_PUBLISHED: 'Uma rota publicada não é excluída: desative-a.',
    ROUTE_WRONG_STATUS: 'A rota não pode mudar para esse estado.',
    ROUTE_NEEDS_SCHEDULE: 'Adicione pelo menos um horário ativo antes de publicar a rota.',
    ROUTE_NEEDS_FARE: 'Defina a tarifa da origem ao destino final antes de publicar a rota.',
    TOO_MANY_SCHEDULES: 'Esta rota já tem o máximo de horários.',
    SCHEDULE_HAS_BOOKINGS: 'Este horário tem reservas: pause-o em vez de excluí-lo.',
    LAYOUT_IN_USE: 'Há horários usando este mapa de assentos. Troque-os antes de excluí-lo.',
    VEHICLE_INSURANCE_EXPIRED:
      'O seguro RCV deste veículo está vencido nessa data. Atualize-o ou escolha outro veículo.',
    ACCOUNT_HAS_TRIPS:
      'Você tem viagens pagas ou um táxi pendente: cancele ou viaje antes de excluir a conta.',
    ACCOUNT_HAS_REFUNDS:
      'Você tem um pagamento em verificação ou um reembolso a receber: aguarde terminar para excluir a conta.',
    ACCOUNT_OWNS_ORGANIZATION:
      'Você é o único dono de uma empresa: passe a titularidade para outra pessoa antes de excluir a conta.',
    SEAT_TAKEN: 'Alguém acabou de reservar um desses assentos. Volte e escolha outro.',
    TOO_MANY_HOLDS:
      'Você tem reservas sem pagar. Pague ou cancele antes de reservar mais assentos.',
    DEPARTURE_NOT_BOOKABLE: 'Esta partida não pode mais ser reservada.',
    BOOKING_NOT_AWAITING_PAYMENT: 'Esta reserva não está mais aguardando pagamento.',
    PAYMENT_METHOD_UNAVAILABLE: 'Essa forma de pagamento não está disponível para esta reserva.',
    PAYMENT_UNDER_REVIEW: 'Estamos verificando o pagamento que você informou; aguarde a resposta.',
    PAYMENT_NOT_REPORTABLE: 'Este pagamento não pode mais ser informado.',
    PAYMENT_NOT_REPORTED: 'Este pagamento não está aguardando verificação.',
    VEHICLE_PLATE_TAKEN: 'Você já tem um veículo com essa placa.',
    VEHICLE_INACTIVE: 'Esse veículo está inativo.',
    VEHICLE_LAYOUT_MISMATCH: 'Esse veículo tem outro mapa de assentos que esta partida.',
    VEHICLE_BUSY: 'Esse veículo já está em outra viagem nesse horário.',
    DRIVER_BUSY: 'Esse motorista já está em outra viagem nesse horário.',
    TRIP_CANCELLED: 'Esta partida foi cancelada.',
    TAXI_TERMINAL_NOT_SERVED: 'Nenhuma cooperativa de táxi atende esse terminal no momento.',
    TAXI_RIDE_OPEN: 'Você já tem um táxi em andamento. Abra-o para ver o status.',
    TAXI_RIDE_TAKEN: 'Outro táxi aceitou o pedido, ou ele expirou.',
    TAXI_RIDE_NOT_CANCELLABLE: 'Este táxi não pode mais ser cancelado.',
    TAXI_RIDE_NOT_RELEASABLE: 'Só é possível liberar uma viagem que ainda não começou.',
    TAXI_RIDE_WRONG_STEP: 'A viagem mudou de status. Atualize a tela.',
    TAXI_LINE_INACTIVE: 'A cooperativa de táxi não está ativa.',
    NOT_A_TAXI_LINE: 'Só cooperativas de táxi atendem pedidos de táxi.',
    COLLECTION_EXCEEDS_DEBT: 'O valor é maior do que a empresa deve à plataforma nessa moeda.',
    PAYOUT_EXCEEDS_BALANCE: 'O repasse é maior que o saldo da empresa nessa moeda.',
    PAYOUT_ALREADY_VOIDED: 'Este repasse já foi anulado.',
    PAYMENT_NOT_REFUND_DUE: 'Este pagamento não está aguardando reembolso.',
    BOOKING_NOT_CANCELLABLE:
      'Esta reserva não pode mais ser cancelada: o ônibus partiu ou você embarcou.',
    TRIP_TOO_EARLY:
      'Ainda é cedo: a partida pode ser marcada a partir de 2 horas antes do horário.',
    TRIP_WRONG_STEP:
      'Essa etapa não se aplica: marque primeiro a partida e depois a chegada, uma vez cada.',
    FISCAL_SETTINGS_INCOMPLETE:
      'Preencha os dados fiscais (razão social, RIF e endereço) antes de emitir.',
    BCV_RATE_MISSING: 'Falta a taxa BCV dessa data (ou de um dia anterior).',
    INVOICE_NOT_DRAFT: 'Este documento já foi emitido ou anulado.',
    INVOICE_ALREADY_VOIDED: 'Este documento já foi anulado.',
    INVOICE_RELATED_NOT_ISSUED: 'Emita primeiro a fatura que esta nota de crédito corrige.',
    INVOICE_NUMBER_TAKEN: 'Já existe um documento com esse número ou número de controle.',
    PURCHASE_TAKEN: 'Essa fatura de compra já está registrada.',
    INVOICE_ALREADY_ISSUED: 'A fatura já foi emitida: não é possível mudar o nome dela.',
    ACCOUNT_REQUIRED:
      'Para isso você precisa criar sua conta (e-mail e senha). Suas viagens são mantidas.',
    NOT_A_GUEST: 'Esta conta já está registrada.',
  },
};

export const SHARED_MESSAGES: Record<Locale, SharedMessages> = { es, en, 'pt-BR': ptBR };

export function sharedMessages(locale: Locale): SharedMessages {
  return SHARED_MESSAGES[locale];
}

/**
 * Text for an API error the user should see, in `locale`: the reason's, then the code's, else the
 * API's own message (validation details and older conflicts are specific enough), else generic.
 */
export function apiErrorText(
  locale: Locale,
  error: { code?: ApiErrorCode | 'NETWORK'; reason?: ApiErrorReason; message?: string },
): string {
  const messages = SHARED_MESSAGES[locale];
  if (error.code === 'NETWORK') return messages.errors.network;
  if (error.reason && messages.reasons[error.reason]) return messages.reasons[error.reason];
  if (error.code && messages.errors[error.code]) return messages.errors[error.code]!;
  return error.message || messages.errors.INTERNAL_ERROR;
}

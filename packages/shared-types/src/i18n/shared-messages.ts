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
    confirmed: 'Pagado',
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
    SEAT_TAKEN: 'Alguien acaba de apartar uno de esos puestos. Vuelve atrás y elige otro.',
    TOO_MANY_HOLDS: 'Tienes reservas sin pagar. Págalas o cancélalas antes de apartar más puestos.',
    DEPARTURE_NOT_BOOKABLE: 'Esta salida ya no se puede reservar.',
    BOOKING_NOT_AWAITING_PAYMENT: 'Esta reserva ya no está esperando el pago.',
    PAYMENT_METHOD_UNAVAILABLE: 'Ese método de pago no está disponible para esta reserva.',
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
    PAYOUT_EXCEEDS_BALANCE: 'El pago es mayor que el saldo de la empresa en esa moneda.',
    PAYOUT_ALREADY_VOIDED: 'Este pago a la empresa ya fue anulado.',
    PAYMENT_NOT_REFUND_DUE: 'Este pago no está pendiente de reembolso.',
    BOOKING_NOT_CANCELLABLE: 'Esta reserva ya no se puede cancelar: el viaje salió o ya abordaste.',
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
    confirmed: 'Paid',
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
    SEAT_TAKEN: 'Someone just held one of those seats. Go back and choose another.',
    TOO_MANY_HOLDS: 'You have unpaid bookings. Pay or cancel them before holding more seats.',
    DEPARTURE_NOT_BOOKABLE: 'This departure can no longer be booked.',
    BOOKING_NOT_AWAITING_PAYMENT: 'This booking is no longer waiting for payment.',
    PAYMENT_METHOD_UNAVAILABLE: 'That payment method is not available for this booking.',
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
    PAYOUT_EXCEEDS_BALANCE: "The payout is larger than the company's balance in that currency.",
    PAYOUT_ALREADY_VOIDED: 'This payout was already voided.',
    PAYMENT_NOT_REFUND_DUE: 'This payment is not awaiting a refund.',
    BOOKING_NOT_CANCELLABLE:
      'This booking can no longer be cancelled: the bus left or you boarded.',
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
    confirmed: 'Pago',
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
    SEAT_TAKEN: 'Alguém acabou de reservar um desses assentos. Volte e escolha outro.',
    TOO_MANY_HOLDS:
      'Você tem reservas sem pagar. Pague ou cancele antes de reservar mais assentos.',
    DEPARTURE_NOT_BOOKABLE: 'Esta partida não pode mais ser reservada.',
    BOOKING_NOT_AWAITING_PAYMENT: 'Esta reserva não está mais aguardando pagamento.',
    PAYMENT_METHOD_UNAVAILABLE: 'Essa forma de pagamento não está disponível para esta reserva.',
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
    PAYOUT_EXCEEDS_BALANCE: 'O repasse é maior que o saldo da empresa nessa moeda.',
    PAYOUT_ALREADY_VOIDED: 'Este repasse já foi anulado.',
    PAYMENT_NOT_REFUND_DUE: 'Este pagamento não está aguardando reembolso.',
    BOOKING_NOT_CANCELLABLE:
      'Esta reserva não pode mais ser cancelada: o ônibus partiu ou você embarcou.',
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

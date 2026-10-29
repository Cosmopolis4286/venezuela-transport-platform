/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on `message`.
 * Add new codes freely; renaming or removing one is a breaking change.
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Why a request was refused, when the code alone (usually `CONFLICT`) does not say what to do.
 * Optional and additive: clients that only look at `code` keep working. Stable like the codes;
 * clients show `API_ERROR_REASON_MESSAGES` instead of matching the English `message`.
 */
export const API_ERROR_REASONS = [
  // Bookings and payments
  'SEAT_TAKEN',
  'TOO_MANY_HOLDS',
  'DEPARTURE_NOT_BOOKABLE',
  'BOOKING_NOT_AWAITING_PAYMENT',
  'PAYMENT_METHOD_UNAVAILABLE',
  // Vehicles and dispatch
  'VEHICLE_PLATE_TAKEN',
  'VEHICLE_INACTIVE',
  'VEHICLE_LAYOUT_MISMATCH',
  'VEHICLE_BUSY',
  'DRIVER_BUSY',
  'TRIP_CANCELLED',
  // Taxis
  'TAXI_TERMINAL_NOT_SERVED',
  'TAXI_RIDE_OPEN',
  'TAXI_RIDE_TAKEN',
  'TAXI_RIDE_NOT_CANCELLABLE',
  'TAXI_RIDE_NOT_RELEASABLE',
  'TAXI_RIDE_WRONG_STEP',
  'TAXI_LINE_INACTIVE',
  'NOT_A_TAXI_LINE',
] as const;

export type ApiErrorReason = (typeof API_ERROR_REASONS)[number];

/** What to tell the user for each reason, in Spanish. */
export const API_ERROR_REASON_MESSAGES: Record<ApiErrorReason, string> = {
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
};

/** One problem with a specific input field. */
export interface ApiFieldError {
  /** Dotted path to the offending field, e.g. `passenger.documentNumber`. */
  field: string;
  message: string;
}

/** Body returned by every non-2xx API response. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    /** Set when the code alone does not say what went wrong (see `API_ERROR_REASONS`). */
    reason?: ApiErrorReason;
    /** Human-readable summary, safe to show to end users. Never contains secrets or PII. */
    message: string;
    details?: ApiFieldError[];
    /** Correlates the response with server logs. Include it in support requests. */
    requestId?: string;
    /** ISO-8601 timestamp. */
    timestamp: string;
  };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes((error as { code: string }).code) &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

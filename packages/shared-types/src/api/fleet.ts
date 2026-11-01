/**
 * Seat layouts: the seat map of a type of vehicle an operator runs (a 2-2 coach, a 2-1 sleeper,
 * a double-decker, a por puesto car). Schedules reference a layout so passengers can pick seats.
 *
 * A layout is a grid per deck. Cells without a seat are aisle or empty space; the UI draws them
 * as gaps. Seat numbers are what is printed on the bus and on the ticket.
 */

export const SEAT_LAYOUT_LIMITS = {
  maxDecks: 2,
  maxRows: 20,
  minColumns: 2,
  maxColumns: 6,
  maxSeats: 100,
} as const;

export interface LayoutSeat {
  /** Printed seat number, e.g. `"12"` or `"A3"` (1–4 letters or digits). */
  number: string;
  /** 0 = lower (or only) deck, 1 = upper deck. */
  deck: number;
  /** 0-based, front to back. */
  row: number;
  /** 0-based, left to right as seen facing forward. */
  column: number;
}

export interface SeatLayout {
  id: string;
  organizationId: string;
  name: string;
  decks: number;
  rows: number;
  columns: number;
  seats: LayoutSeat[];
  /** Number of seats. */
  capacity: number;
  /** Schedules using this layout. A layout in use cannot be deleted. */
  scheduleCount: number;
  createdAt: string;
}

/** `POST /organizations/:id/seat-layouts` and `PATCH …/:layoutId` (all optional on PATCH). */
export interface SeatLayoutInput {
  name: string;
  decks: number;
  rows: number;
  columns: number;
  seats: LayoutSeat[];
}

export const SEAT_LAYOUT_PRESETS = ['coach_2_2', 'sleeper_2_1', 'double_decker', 'car_4'] as const;
export type SeatLayoutPreset = (typeof SEAT_LAYOUT_PRESETS)[number];

export const SEAT_LAYOUT_PRESET_LABELS: Record<SeatLayoutPreset, string> = {
  coach_2_2: 'Autobús 2-2 (44 puestos)',
  sleeper_2_1: 'Buscama 2-1 (30 puestos)',
  double_decker: 'Dos pisos (60 puestos)',
  car_4: 'Carro por puesto (4 puestos)',
};

/** Seats on the given columns of every row of one deck, numbered from `first`. */
function grid(deck: number, rows: number, seatColumns: number[], first: number): LayoutSeat[] {
  const seats: LayoutSeat[] = [];
  for (let row = 0; row < rows; row++) {
    for (const column of seatColumns) {
      seats.push({ number: String(first + seats.length), deck, row, column });
    }
  }
  return seats;
}

/** A starting layout the operator can then edit. */
export function presetLayout(preset: SeatLayoutPreset): SeatLayoutInput {
  switch (preset) {
    case 'coach_2_2':
      return {
        name: 'Autobús 2-2',
        decks: 1,
        rows: 11,
        columns: 5,
        seats: grid(0, 11, [0, 1, 3, 4], 1),
      };
    case 'sleeper_2_1':
      return {
        name: 'Buscama 2-1',
        decks: 1,
        rows: 10,
        columns: 4,
        seats: grid(0, 10, [0, 2, 3], 1),
      };
    case 'double_decker': {
      const lower = grid(0, 4, [0, 2, 3], 1);
      return {
        name: 'Dos pisos',
        decks: 2,
        rows: 12,
        columns: 5,
        seats: [...lower, ...grid(1, 12, [0, 1, 3, 4], lower.length + 1)],
      };
    }
    case 'car_4':
      // Front: driver on the left, one passenger on the right. Back: three passengers.
      return {
        name: 'Carro por puesto',
        decks: 1,
        rows: 2,
        columns: 3,
        seats: [
          { number: '1', deck: 0, row: 0, column: 2 },
          { number: '2', deck: 0, row: 1, column: 0 },
          { number: '3', deck: 0, row: 1, column: 1 },
          { number: '4', deck: 0, row: 1, column: 2 },
        ],
      };
  }
}

const SEAT_NUMBER = /^[A-Za-z0-9]{1,4}$/;

/** Returns a Spanish explanation of the first problem, or null when the layout is valid. */
export function layoutProblem(layout: Omit<SeatLayoutInput, 'name'>): string | null {
  const { decks, rows, columns, seats } = layout;
  const limits = SEAT_LAYOUT_LIMITS;
  if (!Number.isInteger(decks) || decks < 1 || decks > limits.maxDecks)
    return 'Usa uno o dos pisos.';
  if (!Number.isInteger(rows) || rows < 1 || rows > limits.maxRows)
    return `Usa entre 1 y ${limits.maxRows} filas.`;
  if (!Number.isInteger(columns) || columns < limits.minColumns || columns > limits.maxColumns)
    return `Usa entre ${limits.minColumns} y ${limits.maxColumns} columnas.`;
  if (seats.length < 1) return 'Agrega al menos un puesto.';
  if (seats.length > limits.maxSeats)
    return `Un vehículo puede tener hasta ${limits.maxSeats} puestos.`;
  const positions = new Set<string>();
  const numbers = new Set<string>();
  for (const seat of seats) {
    if (
      !Number.isInteger(seat.deck) ||
      !Number.isInteger(seat.row) ||
      !Number.isInteger(seat.column) ||
      seat.deck < 0 ||
      seat.deck >= decks ||
      seat.row < 0 ||
      seat.row >= rows ||
      seat.column < 0 ||
      seat.column >= columns
    ) {
      return `El puesto ${seat.number} está fuera del plano.`;
    }
    if (!SEAT_NUMBER.test(seat.number))
      return 'Los números de puesto usan de 1 a 4 letras o cifras.';
    const position = `${seat.deck}:${seat.row}:${seat.column}`;
    if (positions.has(position)) return 'Hay dos puestos en la misma casilla.';
    if (numbers.has(seat.number.toUpperCase())) return `El número ${seat.number} está repetido.`;
    positions.add(position);
    numbers.add(seat.number.toUpperCase());
  }
  return null;
}

/** Renumbers seats 1…n deck by deck, front to back, left to right. */
export function renumberSeats(seats: LayoutSeat[]): LayoutSeat[] {
  return [...seats]
    .sort((a, b) => a.deck - b.deck || a.row - b.row || a.column - b.column)
    .map((seat, index) => ({ ...seat, number: String(index + 1) }));
}

/**
 * Vehicles: the buses and cars an operator runs, assigned to trips by dispatchers. A vehicle can
 * name the seat layout it has, so it is only assigned to departures sold on that map.
 */
export interface FleetVehicle {
  id: string;
  organizationId: string;
  /** Normalized: upper case, letters and digits only, e.g. `A12BC3D`. */
  plate: string;
  /** Free text for staff, e.g. "Unidad 12 · Encava 610". */
  label: string | null;
  seatLayout: { id: string; name: string; capacity: number } | null;
  /** Inactive vehicles keep their past trips but cannot be assigned again. */
  active: boolean;
  /** Registration, insurance and transport permit, each with its expiry. */
  documents: VehicleDocument[];
  /** The worst state among its documents (`expired` beats `expiring`); null when all are valid. */
  documentAlert: VehicleDocumentStatus | null;
  createdAt: string;
}

/** Papers a vehicle must carry. */
export const VEHICLE_DOCUMENT_KINDS = ['registration', 'insurance', 'transport_permit'] as const;
export type VehicleDocumentKind = (typeof VEHICLE_DOCUMENT_KINDS)[number];

export const VEHICLE_DOCUMENT_LABELS: Record<VehicleDocumentKind, string> = {
  registration: 'Certificado de circulación',
  insurance: 'Póliza de seguro (RCV)',
  transport_permit: 'Permiso de transporte',
};

/** `expiring`: within `VEHICLE_DOCUMENT_WARNING_DAYS` days. */
export type VehicleDocumentStatus = 'valid' | 'expiring' | 'expired';
export const VEHICLE_DOCUMENT_WARNING_DAYS = 30;

export interface VehicleDocument {
  kind: VehicleDocumentKind;
  number: string;
  /** Last valid day, `YYYY-MM-DD`. */
  expiresOn: string;
  status: VehicleDocumentStatus;
}

/** `PUT /organizations/:id/vehicles/:vehicleId/documents/:kind` */
export interface VehicleDocumentInput {
  number: string;
  expiresOn: string;
}

/** Status of a document that expires on `expiresOn` (last valid day) as of `today`. */
export function vehicleDocumentStatus(expiresOn: string, today: string): VehicleDocumentStatus {
  if (expiresOn < today) return 'expired';
  const days =
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= VEHICLE_DOCUMENT_WARNING_DAYS ? 'expiring' : 'valid';
}

/** The worst status of a list, or null when every document is valid (or there are none). */
export function worstDocumentStatus(
  statuses: readonly VehicleDocumentStatus[],
): VehicleDocumentStatus | null {
  if (statuses.includes('expired')) return 'expired';
  return statuses.includes('expiring') ? 'expiring' : null;
}

/** `POST /organizations/:id/vehicles` and `PATCH …/:vehicleId` (all optional on PATCH). */
export interface VehicleInput {
  plate: string;
  label?: string | null;
  seatLayoutId?: string | null;
  active?: boolean;
}

/** Upper case without spaces, dashes or dots: `ab-123 cd` → `AB123CD`. */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s.-]/g, '');
}

/** Venezuelan plates have 5 to 8 letters and digits; returns a Spanish explanation or null. */
export function plateProblem(plate: string): string | null {
  return /^[A-Z0-9]{5,8}$/.test(normalizePlate(plate))
    ? null
    : 'La placa debe tener de 5 a 8 letras o cifras.';
}

/** How a vehicle is shown in lists: plate, then the label. */
export function vehicleName(vehicle: Pick<FleetVehicle, 'plate' | 'label'>): string {
  return vehicle.label ? `${vehicle.plate} · ${vehicle.label}` : vehicle.plate;
}

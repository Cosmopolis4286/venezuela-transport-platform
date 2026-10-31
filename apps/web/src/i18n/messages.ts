import type { Locale } from '@vtp/shared-types';

/** Texts of the public website (home and departure search). Spanish is the source. */
const es = {
  meta: {
    title: 'VTP · Transporte terrestre en Venezuela',
    description: 'Busca y reserva viajes en autobús en Venezuela.',
    search: 'Buscar viajes',
  },
  header: { portal: 'Portal de operadores', language: 'Idioma' },
  home: {
    heading: 'Viaja por Venezuela en autobús o por puesto',
    intro: 'Compara horarios, precios y empresas entre terminales de todo el país.',
    operatorsBefore:
      '¿Tienes una empresa de transporte o una línea de taxis? Publica tus rutas desde el',
    operatorsLink: 'portal de operadores',
  },
  form: {
    origin: 'Origen',
    fromPlaceholder: '¿Desde dónde sales?',
    destination: 'Destino',
    toPlaceholder: '¿A dónde vas?',
    date: 'Fecha',
    submit: 'Buscar viajes',
  },
  results: {
    searching: 'Buscando…',
    choose: 'Elige el origen, el destino y la fecha.',
    heading: 'Resultados',
    departures: (n: number) => `${n} ${n === 1 ? 'salida' : 'salidas'}`,
    returnTrip: 'Ver el regreso',
    none: 'No hay salidas publicadas para ese día. Prueba con otra fecha o con una terminal cercana.',
    footnote:
      'Horas de Venezuela. Para apartar y pagar tus puestos, usa la app VTP Pasajeros o la taquilla de la empresa.',
    seatsFree: (free: number, total: number) => `${free} de ${total} puestos libres`,
    route: (name: string) => `ruta ${name}`,
    priceAtCounter: 'Precio en taquilla',
    dayOffset: (days: number) => ` (+${days} d)`,
    sameStop: 'Elige un destino distinto del origen.',
    dateRange: 'Elige una fecha entre hoy y los próximos 180 días.',
  },
};

export type Messages = typeof es;

const en: Messages = {
  meta: {
    title: 'VTP · Ground transport in Venezuela',
    description: 'Find and book bus trips in Venezuela.',
    search: 'Search trips',
  },
  header: { portal: 'Operator portal', language: 'Language' },
  home: {
    heading: 'Travel around Venezuela by bus or shared car',
    intro: 'Compare schedules, prices and companies between terminals all over the country.',
    operatorsBefore: 'Do you run a transport company or a taxi line? Publish your routes from the',
    operatorsLink: 'operator portal',
  },
  form: {
    origin: 'From',
    fromPlaceholder: 'Where are you leaving from?',
    destination: 'To',
    toPlaceholder: 'Where are you going?',
    date: 'Date',
    submit: 'Search trips',
  },
  results: {
    searching: 'Searching…',
    choose: 'Choose the origin, the destination and the date.',
    heading: 'Results',
    departures: (n) => `${n} ${n === 1 ? 'departure' : 'departures'}`,
    returnTrip: 'See the return trip',
    none: 'No departures are published for that day. Try another date or a nearby terminal.',
    footnote:
      'Venezuelan time. To hold and pay for your seats, use the VTP Passengers app or the company’s ticket office.',
    seatsFree: (free, total) => `${free} of ${total} seats available`,
    route: (name) => `route ${name}`,
    priceAtCounter: 'Price at the ticket office',
    dayOffset: (days) => ` (+${days} d)`,
    sameStop: 'Choose a destination different from the origin.',
    dateRange: 'Choose a date between today and the next 180 days.',
  },
};

const ptBR: Messages = {
  meta: {
    title: 'VTP · Transporte rodoviário na Venezuela',
    description: 'Encontre e reserve viagens de ônibus na Venezuela.',
    search: 'Buscar viagens',
  },
  header: { portal: 'Portal de operadores', language: 'Idioma' },
  home: {
    heading: 'Viaje pela Venezuela de ônibus ou carro compartilhado',
    intro: 'Compare horários, preços e empresas entre terminais de todo o país.',
    operatorsBefore:
      'Você tem uma empresa de transporte ou uma cooperativa de táxi? Publique suas rotas no',
    operatorsLink: 'portal de operadores',
  },
  form: {
    origin: 'Origem',
    fromPlaceholder: 'De onde você sai?',
    destination: 'Destino',
    toPlaceholder: 'Para onde você vai?',
    date: 'Data',
    submit: 'Buscar viagens',
  },
  results: {
    searching: 'Buscando…',
    choose: 'Escolha a origem, o destino e a data.',
    heading: 'Resultados',
    departures: (n) => `${n} ${n === 1 ? 'partida' : 'partidas'}`,
    returnTrip: 'Ver a volta',
    none: 'Não há partidas publicadas para esse dia. Tente outra data ou um terminal próximo.',
    footnote:
      'Horário da Venezuela. Para reservar e pagar seus assentos, use o app VTP Passageiros ou o guichê da empresa.',
    seatsFree: (free, total) => `${free} de ${total} assentos livres`,
    route: (name) => `rota ${name}`,
    priceAtCounter: 'Preço no guichê',
    dayOffset: (days) => ` (+${days} d)`,
    sameStop: 'Escolha um destino diferente da origem.',
    dateRange: 'Escolha uma data entre hoje e os próximos 180 dias.',
  },
};

export const MESSAGES: Record<Locale, Messages> = { es, en, 'pt-BR': ptBR };

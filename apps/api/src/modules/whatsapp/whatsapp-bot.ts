import { Injectable } from '@nestjs/common';
import {
  formatMoney,
  MAX_TAXI_PASSENGERS,
  TRANSPORT_MODE_LABELS,
  type Currency,
  type OnDemandMode,
  type StopSummary,
} from '@vtp/shared-types';
import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { TaxiService } from '../taxi/taxi.service.js';
import { plain, type InboundMessage } from './whatsapp-inbound.js';
import type { OutgoingMessage } from './whatsapp-sender.js';
import type { WhatsappChatRow, WhatsappChatState, WhatsappDraft } from './whatsapp.schema.js';

/** A person answers the chat for this long after the bot hands it over. */
export const HUMAN_HANDOFF_HOURS = 12;
/** A half-finished taxi request older than this starts over at the menu. */
const DRAFT_MINUTES = 30;

export interface BotTurn {
  replies: OutgoingMessage[];
  state: WhatsappChatState;
  draft: WhatsappDraft;
  humanUntil?: Date | null;
  userId?: string;
}

type Stretch = Awaited<ReturnType<TaxiService['stretchCatalog']>>[number];

const MENU_WORDS = new Set([
  'menu',
  'hola',
  'inicio',
  'buenas',
  'buenos dias',
  'buenas tardes',
  '0',
]);
const CANCEL_WORDS = new Set(['cancelar', 'salir', 'no']);

const fareText = (s: Pick<Stretch, 'currency' | 'minFare' | 'maxFare'>) =>
  s.minFare === s.maxFare
    ? formatMoney(s.minFare, s.currency as Currency)
    : `${formatMoney(s.minFare, s.currency as Currency)} a ${formatMoney(s.maxFare, s.currency as Currency)}`;

const modeName = (mode: OnDemandMode) => TRANSPORT_MODE_LABELS[mode].toLowerCase();

/**
 * The WhatsApp menu (ADR-038): answers by number or by tapped option, and asks for a taxi or a
 * motorcycle between two stops step by step, with the price before asking. Everything is a reply
 * to the person's last message, inside Meta's free window. Bank details are never written here:
 * payments happen in the app with their reference.
 */
@Injectable()
export class WhatsappBot {
  constructor(
    private readonly taxi: TaxiService,
    private readonly config: AppConfigService,
  ) {}

  async handle(chat: WhatsappChatRow, inbound: InboundMessage, now = new Date()): Promise<BotTurn> {
    const typed = plain(inbound.text);
    const draft = chat.draft ?? {};
    // "menú" always works, also when a person is handling the chat.
    if (MENU_WORDS.has(typed) || inbound.choiceId === 'menu') return this.menu(chat);
    if (chat.state === 'human' && chat.humanUntil && chat.humanUntil > now) {
      return { replies: [], state: 'human', draft: {} };
    }
    const stale = now.getTime() - chat.updatedAt.getTime() > DRAFT_MINUTES * 60_000;
    if (chat.state.startsWith('taxi_') && !stale && CANCEL_WORDS.has(typed)) {
      return {
        replies: [{ text: 'Listo, no pedí nada. Escribe *menú* cuando me necesites.' }],
        state: 'menu',
        draft: {},
      };
    }
    if (chat.state === 'rate') {
      const rated = await this.rate(chat, inbound, draft);
      if (rated) return rated;
    } else if (chat.state.startsWith('taxi_') && !stale) {
      return this.taxiStep(chat, inbound, draft);
    }
    return this.fromMenu(chat, inbound, typed);
  }

  // --- Menu -----------------------------------------------------------------------------------

  private menu(chat: WhatsappChatRow, prefix?: string): BotTurn {
    const name = chat.profileName?.split(' ')[0];
    const hello = prefix ?? `¡Hola${name ? `, ${name}` : ''}! 👋`;
    return {
      state: 'menu',
      draft: {},
      humanUntil: null,
      replies: [
        {
          text: `${hello} ¿Qué necesitas? Toca una opción o escribe su número.\nEn cualquier momento escribe *menú* para volver aquí.`,
          list: {
            button: 'Ver opciones',
            rows: [
              {
                id: 'menu:1',
                title: 'Reservar puesto',
                description: 'Bus o carrito, con tu boleto en la app',
              },
              {
                id: 'menu:2',
                title: 'Pedir taxi o moto',
                description: 'Te digo el precio antes de pedirlo',
              },
              { id: 'menu:3', title: 'Paquetes Full Day', description: 'Te atiende una persona' },
              { id: 'menu:4', title: 'Descargar la app', description: 'Android' },
              {
                id: 'menu:5',
                title: 'Problema con un pago',
                description: 'Pago o reserva: te atiende una persona',
              },
            ],
          },
        },
      ],
    };
  }

  private async fromMenu(
    chat: WhatsappChatRow,
    inbound: InboundMessage,
    typed: string,
  ): Promise<BotTurn> {
    const option = inbound.choiceId?.startsWith('menu:') ? inbound.choiceId.slice(5) : typed;
    const app = this.link('/es/app');
    switch (option) {
      case '1':
        return {
          state: 'menu',
          draft: {},
          replies: [
            {
              text: `Reserva y paga tu puesto en la app, *sin registrarte*: buscas la ruta, eliges cuántos pasajeros y pagas con pago móvil o transferencia usando la *referencia* que te da la app. Tu boleto QR queda en el teléfono.\n\n📲 ${app}\n\nEscribe *menú* para volver.`,
            },
          ],
        };
      case '2':
        return this.startTaxi();
      case '4':
        return {
          state: 'menu',
          draft: {},
          replies: [
            {
              text: `📲 Descarga la app para Android aquí:\n${app}\n\nEscribe *menú* para volver.`,
            },
          ],
        };
      case '3':
      case '5':
        return this.human(
          option === '5'
            ? 'Te paso con una persona del equipo 🙋. Mientras tanto, envíanos el *código de tu reserva* (empieza por VTP-) y, si ya pagaste, el *número de operación*. Nunca te pediremos claves ni códigos.'
            : 'Te paso con una persona del equipo 🙋 para contarte de los paquetes Full Day.',
        );
      default:
        return chat.state === 'menu' && chat.createdAt.getTime() !== chat.updatedAt.getTime()
          ? this.menu(chat, 'No entendí 🙈.')
          : this.menu(chat);
    }
  }

  private human(text: string, now = new Date()): BotTurn {
    return {
      state: 'human',
      draft: {},
      humanUntil: new Date(now.getTime() + HUMAN_HANDOFF_HOURS * 3_600_000),
      replies: [{ text: `${text}\n\nPara volver al menú automático escribe *menú*.` }],
    };
  }

  // --- Taxi or motorcycle -----------------------------------------------------------------------

  private async startTaxi(): Promise<BotTurn> {
    const modes: OnDemandMode[] = [];
    for (const mode of ['motorcycle', 'car'] as const) {
      if ((await this.taxi.stretchCatalog(mode)).length) modes.push(mode);
    }
    if (!modes.length) {
      return this.human('Ahora mismo no hay taxis ni motos que se pidan por aquí en tu zona.');
    }
    if (modes.length === 1) return this.askFrom({ mode: modes[0]! });
    return {
      state: 'taxi_mode',
      draft: {},
      replies: [
        {
          text: '¿En qué quieres ir?',
          buttons: [
            { id: 'mode:motorcycle', title: '🛵 Moto (1 persona)' },
            { id: 'mode:car', title: '🚕 Taxi' },
          ],
        },
      ],
    };
  }

  private async taxiStep(
    chat: WhatsappChatRow,
    inbound: InboundMessage,
    draft: WhatsappDraft,
  ): Promise<BotTurn> {
    const typed = plain(inbound.text);
    switch (chat.state) {
      case 'taxi_mode': {
        const mode =
          inbound.choiceId === 'mode:car' || /taxi|carro|2/.test(typed)
            ? 'car'
            : inbound.choiceId === 'mode:motorcycle' || /moto|1/.test(typed)
              ? 'motorcycle'
              : null;
        if (!mode) return this.retry(chat, draft, 'Toca *Moto* o *Taxi*.');
        return this.askFrom({ mode });
      }
      case 'taxi_from': {
        const stop = this.pick(inbound, await this.fromStops(draft.mode!));
        if (!stop)
          return this.retry(chat, draft, 'Elige la parada de la lista (toca o escribe su número).');
        return this.askTo({ ...draft, fromStopId: stop.id });
      }
      case 'taxi_to': {
        const options = await this.toStops(draft.mode!, draft.fromStopId!);
        const stop = this.pick(
          inbound,
          options.map((o) => o.stop),
        );
        if (!stop) return this.retry(chat, draft, 'Elige a dónde vas (toca o escribe su número).');
        return this.askAddress({ ...draft, toStopId: stop.id });
      }
      case 'taxi_address': {
        const address = inbound.location
          ? `📍 ${inbound.location.label ? `${inbound.location.label} · ` : ''}https://maps.google.com/?q=${inbound.location.latitude},${inbound.location.longitude}`
          : inbound.text.trim();
        if (address.length < 5) {
          return this.retry(
            chat,
            draft,
            'Escribe la calle, el sector y una referencia (o comparte tu ubicación 📍).',
          );
        }
        const next = { ...draft, address: address.slice(0, 200) };
        return draft.mode === 'motorcycle'
          ? this.confirm({ ...next, passengers: 1 })
          : this.askPassengers(next);
      }
      case 'taxi_passengers': {
        const n = Number(inbound.choiceId?.replace('people:', '') ?? typed.match(/\d+/)?.[0]);
        if (!Number.isInteger(n) || n < 1 || n > MAX_TAXI_PASSENGERS) {
          return this.retry(chat, draft, `¿Cuántas personas van? (de 1 a ${MAX_TAXI_PASSENGERS})`);
        }
        return this.confirm({ ...draft, passengers: n });
      }
      case 'taxi_confirm': {
        if (inbound.choiceId === 'taxi:change' || /cambiar/.test(typed)) return this.startTaxi();
        if (inbound.choiceId === 'taxi:no' || CANCEL_WORDS.has(typed)) {
          return {
            replies: [{ text: 'Listo, no pedí nada. Escribe *menú* cuando me necesites.' }],
            state: 'menu',
            draft: {},
          };
        }
        if (inbound.choiceId === 'taxi:yes' || /^(si|pedir|ok|dale|listo)/.test(typed)) {
          return this.order(chat, draft);
        }
        return this.retry(chat, draft, 'Toca *Pedir* para confirmar, o *Cambiar*.');
      }
      default:
        return this.menu(chat);
    }
  }

  private retry(chat: WhatsappChatRow, draft: WhatsappDraft, text: string): BotTurn {
    return { state: chat.state, draft, replies: [{ text: `${text}\nO escribe *cancelar*.` }] };
  }

  /** The stop the person tapped, typed the number of, or typed the name of. */
  private pick(inbound: InboundMessage, stops: StopSummary[]): StopSummary | null {
    if (inbound.choiceId?.startsWith('stop:')) {
      return stops.find((s) => s.id === inbound.choiceId!.slice(5)) ?? null;
    }
    const typed = plain(inbound.text);
    const n = /^\d+$/.test(typed) ? Number(typed) : NaN;
    if (n >= 1 && n <= stops.length) return stops[n - 1]!;
    const matches = stops.filter((s) => typed.length >= 3 && plain(s.name).includes(typed));
    return matches.length === 1 ? matches[0]! : null;
  }

  private async fromStops(mode: OnDemandMode): Promise<StopSummary[]> {
    const seen = new Map<string, StopSummary>();
    for (const s of await this.taxi.stretchCatalog(mode))
      for (const stop of s.stops) seen.set(stop.id, stop);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private async toStops(mode: OnDemandMode, fromId: string) {
    return (await this.taxi.stretchCatalog(mode))
      .filter((s) => s.stops.some((x) => x.id === fromId))
      .map((s) => ({ stretch: s, stop: s.stops.find((x) => x.id !== fromId)! }))
      .sort((a, b) => a.stop.name.localeCompare(b.stop.name, 'es'));
  }

  private options(
    text: string,
    rows: { id: string; title: string; description?: string }[],
  ): OutgoingMessage {
    // More than 10 options do not fit a WhatsApp list: they go as numbered text.
    return rows.length <= 10
      ? { text, list: { button: 'Ver opciones', rows } }
      : {
          text: `${text}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ''}`).join('\n')}`,
        };
  }

  private async askFrom(draft: WhatsappDraft): Promise<BotTurn> {
    const stops = await this.fromStops(draft.mode!);
    return {
      state: 'taxi_from',
      draft,
      replies: [
        this.options(
          `${draft.mode === 'motorcycle' ? '🛵' : '🚕'} ¿Desde qué parada o sector sales?`,
          stops.map((s) => ({ id: `stop:${s.id}`, title: s.name, description: s.city })),
        ),
      ],
    };
  }

  private async askTo(draft: WhatsappDraft): Promise<BotTurn> {
    const options = await this.toStops(draft.mode!, draft.fromStopId!);
    return {
      state: 'taxi_to',
      draft,
      replies: [
        this.options(
          '¿A dónde vas? Al lado ves el precio.',
          options.map((o) => ({
            id: `stop:${o.stop.id}`,
            title: o.stop.name,
            description: fareText(o.stretch),
          })),
        ),
      ],
    };
  }

  private async askAddress(draft: WhatsappDraft): Promise<BotTurn> {
    const [from] = (await this.fromStops(draft.mode!)).filter((s) => s.id === draft.fromStopId);
    return {
      state: 'taxi_address',
      draft,
      replies: [
        {
          text: `¿Dónde te buscamos${from ? `, cerca de ${from.name}` : ''}? Escribe la calle, el sector y una referencia, o comparte tu ubicación 📍.`,
        },
      ],
    };
  }

  private askPassengers(draft: WhatsappDraft): BotTurn {
    return {
      state: 'taxi_passengers',
      draft,
      replies: [
        {
          text: '¿Cuántas personas van? (Si son más de 3, escribe el número.)',
          buttons: [
            { id: 'people:1', title: '1' },
            { id: 'people:2', title: '2' },
            { id: 'people:3', title: '3' },
          ],
        },
      ],
    };
  }

  private async confirm(draft: WhatsappDraft): Promise<BotTurn> {
    const option = (await this.toStops(draft.mode!, draft.fromStopId!)).find(
      (o) => o.stop.id === draft.toStopId,
    );
    const from = option?.stretch.stops.find((s) => s.id === draft.fromStopId);
    if (!option || !from) return this.startTaxi();
    const people = draft.passengers === 1 ? '1 persona' : `${draft.passengers} personas`;
    return {
      state: 'taxi_confirm',
      draft,
      replies: [
        {
          text: `Revisa tu pedido:\n${draft.mode === 'motorcycle' ? '🛵 Moto' : '🚕 Taxi'} de *${from.name}* a *${option.stop.name}*\n📍 Te buscan en: ${draft.address}\n👤 ${people}\n💵 Precio: *${fareText(option.stretch)}*, se le paga al conductor.\n\n¿Lo pido?`,
          buttons: [
            { id: 'taxi:yes', title: '✅ Pedir' },
            { id: 'taxi:change', title: '✏️ Cambiar' },
            { id: 'taxi:no', title: '❌ Cancelar' },
          ],
        },
      ],
    };
  }

  private async order(chat: WhatsappChatRow, draft: WhatsappDraft): Promise<BotTurn> {
    try {
      const { userId, ride } = await this.taxi.requestForChat(
        { phone: chat.phone, name: chat.profileName, userId: chat.userId },
        {
          kind: 'stretch',
          fromStopId: draft.fromStopId,
          toStopId: draft.toStopId,
          mode: draft.mode,
          address: draft.address!,
          passengers: draft.passengers ?? 1,
        },
      );
      const fare = await this.toStops(draft.mode!, draft.fromStopId!);
      const price = fare.find((o) => o.stop.id === draft.toStopId);
      return {
        state: 'menu',
        draft: {},
        userId,
        replies: [
          {
            text: `¡Listo, ya lo pedí! ✅ Los conductores de la zona ya lo están viendo${price ? ` (precio ${fareText(price.stretch)})` : ''}. Te escribo aquí apenas uno lo tome.\n\nSigue tu ${modeName(draft.mode!)} o cancélalo aquí:\n${this.link(`/es${ride.trackingPath}`)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof ApiException && error.reason === 'TAXI_RIDE_OPEN') {
        return {
          state: 'menu',
          draft: {},
          replies: [
            {
              text: 'Ya tienes un viaje en curso. Revisa el enlace que te envié; cuando termine puedes pedir otro.',
            },
          ],
        };
      }
      if (error instanceof ApiException && error.getStatus() < 500) {
        return this.human('No pude pedirlo: ese tramo ya no está disponible.');
      }
      throw error;
    }
  }

  // --- Rating -----------------------------------------------------------------------------------

  private async rate(
    chat: WhatsappChatRow,
    inbound: InboundMessage,
    draft: WhatsappDraft,
  ): Promise<BotTurn | null> {
    const typed = plain(inbound.text);
    const stars = Number(
      inbound.choiceId?.startsWith('rate:')
        ? inbound.choiceId.slice(5)
        : typed.match(/^[1-5]$/)?.[0],
    );
    if (!draft.rideId || !chat.userId || !Number.isInteger(stars) || stars < 1 || stars > 5)
      return null;
    try {
      await this.taxi.rateMine(chat.userId, draft.rideId, { rating: stars });
    } catch (error) {
      if (!(error instanceof ApiException)) throw error;
    }
    return {
      state: 'menu',
      draft: {},
      replies: [
        {
          text: `¡Gracias por calificar! ${'⭐'.repeat(stars)}\nEscribe *menú* cuando necesites otro viaje.`,
        },
      ],
    };
  }

  /** The tracking link and other web pages, on the public website. */
  link(path: string): string {
    return `${this.config.get('PUBLIC_WEB_URL').replace(/\/+$/, '')}${path}`;
  }
}

/** The 1–5 stars question sent after a ride ends (a list, also answered by typing 1 to 5). */
export function ratingQuestion(text: string): OutgoingMessage {
  return {
    text,
    list: {
      button: 'Calificar',
      rows: [5, 4, 3, 2, 1].map((n) => ({
        id: `rate:${n}`,
        title: '⭐'.repeat(n),
        description: `${n} de 5`,
      })),
    },
  };
}

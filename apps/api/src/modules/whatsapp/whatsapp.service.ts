import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  formatMoney,
  TRANSPORT_MODE_LABELS,
  vehicleName,
  type AssistedTaxiRide,
} from '@vtp/shared-types';
import { eq, sql } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { TaxiService } from '../taxi/taxi.service.js';
import { ratingQuestion, WhatsappBot } from './whatsapp-bot.js';
import { parseInbound, type InboundMessage } from './whatsapp-inbound.js';
import {
  asText,
  WHATSAPP_SENDER,
  type OutgoingMessage,
  type WhatsappSender,
} from './whatsapp-sender.js';
import {
  whatsappChats,
  whatsappMessages,
  whatsappRideNotices,
  type WhatsappChatRow,
} from './whatsapp.schema.js';

/** Meta answers for free for this long after the person's last message. */
export const FREE_WINDOW_MS = 24 * 3_600_000;
/** Leeway so a message never lands just outside the window. */
const WINDOW_MARGIN_MS = 10 * 60_000;
const SWEEP_EVERY_MS = 30_000;

/**
 * Automatic WhatsApp (ADR-038). Receives Meta's webhook, answers with the menu bot, and tells the
 * person how their WhatsApp ride goes. It only ever writes inside Meta's free customer-service
 * window (24 hours after the person's last message), with no paid templates: outside it, the
 * message is logged as `outside_window` and staff use the button on the admin page.
 */
@Injectable()
export class WhatsappService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly taxi: TaxiService,
    private readonly bot: WhatsappBot,
    @Inject(WHATSAPP_SENDER) private readonly sender: WhatsappSender,
  ) {}

  get enabled(): boolean {
    return this.config.get('WHATSAPP_DELIVERY') !== 'disabled';
  }

  onApplicationBootstrap(): void {
    // Tests call sweep() themselves.
    if (!this.enabled || this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.error(`WhatsApp ride notices failed: ${(error as Error).message}`),
      );
    }, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Meta's webhook setup: echo the challenge when the verify token matches. */
  verifySubscription(mode: unknown, token: unknown, challenge: unknown): string | null {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN');
    if (!this.enabled || !expected || mode !== 'subscribe' || typeof challenge !== 'string') {
      return null;
    }
    return typeof token === 'string' && safeEqual(token, expected) ? challenge : null;
  }

  /** `X-Hub-Signature-256`: HMAC-SHA256 of the exact body with the Meta app's secret. */
  signatureOk(raw: Buffer | undefined, header: string | undefined): boolean {
    const secret = this.config.get('WHATSAPP_APP_SECRET');
    if (!secret || !raw || !header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    return safeEqual(header.slice(7), expected);
  }

  /** Handles the messages of one webhook call, each once even if Meta retries. */
  async receive(payload: unknown): Promise<void> {
    if (!this.enabled) return;
    for (const inbound of parseInbound(payload)) {
      await this.handle(inbound);
    }
  }

  private async handle(inbound: InboundMessage): Promise<void> {
    const now = new Date();
    const [chat] = await this.database.db
      .insert(whatsappChats)
      .values({ phone: inbound.phone, profileName: inbound.profileName, lastInboundAt: now })
      .onConflictDoUpdate({
        target: whatsappChats.phone,
        set: {
          lastInboundAt: now,
          profileName: sql`coalesce(excluded.profile_name, ${whatsappChats.profileName})`,
        },
      })
      .returning();
    const [recorded] = await this.database.db
      .insert(whatsappMessages)
      .values({
        chatId: chat!.id,
        direction: 'in',
        waMessageId: inbound.id,
        body: inbound.text || `[${inbound.kind}]`,
        status: 'received',
      })
      .onConflictDoNothing({ target: whatsappMessages.waMessageId })
      .returning({ id: whatsappMessages.id });
    if (!recorded) return; // Already handled: Meta delivered it again.

    // The previous update time tells the bot whether a half-done request went stale.
    const turn = await this.bot.handle(chat!, inbound, now);
    await this.database.db
      .update(whatsappChats)
      .set({
        state: turn.state,
        draft: turn.draft,
        ...(turn.humanUntil !== undefined ? { humanUntil: turn.humanUntil } : {}),
        ...(turn.userId ? { userId: turn.userId } : {}),
      })
      .where(eq(whatsappChats.id, chat!.id));
    for (const reply of turn.replies) await this.send(chat!, reply);
  }

  /** Writes to a chat only inside the free window; returns whether it went out. */
  private async send(
    chat: WhatsappChatRow,
    message: OutgoingMessage,
    now = new Date(),
  ): Promise<boolean> {
    const open = now.getTime() - chat.lastInboundAt.getTime() < FREE_WINDOW_MS - WINDOW_MARGIN_MS;
    let status: 'sent' | 'logged' | 'outside_window' | 'failed' = 'outside_window';
    let waMessageId: string | null = null;
    if (open) {
      try {
        waMessageId = await this.sender.send(chat.phone, message);
        status = this.config.get('WHATSAPP_DELIVERY') === 'cloud' ? 'sent' : 'logged';
      } catch (error) {
        status = 'failed';
        this.logger.error(
          `WhatsApp message to chat ${chat.id} failed: ${(error as Error).message}`,
        );
      }
    }
    await this.database.db.insert(whatsappMessages).values({
      chatId: chat.id,
      direction: 'out',
      waMessageId,
      body: asText(message).slice(0, 4000),
      status,
    });
    return status === 'sent' || status === 'logged';
  }

  /**
   * Tells WhatsApp customers how their ride goes (asked for in the chat or by staff): taken, with
   * the plate and price; finished, asking for stars; nobody took it. Each status once per ride.
   */
  async sweep(now = new Date()): Promise<number> {
    if (!this.enabled) return 0;
    const rides = await this.taxi.assistedList(new Date(now.getTime() - FREE_WINDOW_MS));
    let sent = 0;
    for (const assisted of rides) {
      const message = this.notice(assisted);
      if (!message) continue;
      const [chat] = await this.database.db
        .select()
        .from(whatsappChats)
        .where(eq(whatsappChats.phone, assisted.customer.phone));
      if (!chat) continue;
      const [fresh] = await this.database.db
        .insert(whatsappRideNotices)
        .values({ rideId: assisted.ride.id, status: assisted.ride.status })
        .onConflictDoNothing()
        .returning();
      if (!fresh) continue;
      if (await this.send(chat, message, now)) sent += 1;
      if (assisted.ride.status === 'completed' && !assisted.ride.rating) {
        // The stars can be answered by typing a number too.
        await this.database.db
          .update(whatsappChats)
          .set({ state: 'rate', draft: { rideId: assisted.ride.id } })
          .where(eq(whatsappChats.id, chat.id));
      }
    }
    return sent;
  }

  private notice({ ride, trackingPath }: AssistedTaxiRide): OutgoingMessage | null {
    const kind = TRANSPORT_MODE_LABELS[ride.mode].toLowerCase();
    const link = this.bot.link(`/es${trackingPath}`);
    switch (ride.status) {
      case 'accepted': {
        const details = [
          ride.vehicle ? `Placa *${vehicleName(ride.vehicle)}*` : null,
          ride.driver?.firstName ? `conductor ${ride.driver.firstName}` : null,
          ride.fare ? `precio ${formatMoney(ride.fare.amount, ride.fare.currency)}` : null,
        ].filter(Boolean);
        return {
          text: `${ride.mode === 'motorcycle' ? '🛵' : '🚕'} ¡Tu ${kind} va en camino! ${details.join(', ')}.\nRevisa la placa antes de subir. Síguelo aquí: ${link}`,
        };
      }
      case 'completed':
        return ride.rating
          ? null
          : ratingQuestion('Llegaste 🙌 ¿Cómo te fue? Toca las estrellas (o escribe de 1 a 5).');
      case 'expired':
        return {
          text: `Lo siento 😔 ningún conductor tomó tu ${kind} a tiempo. Escribe *2* para pedirlo de nuevo o *menú* para ver las opciones.`,
        };
      default:
        return null;
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

import { Logger } from '@nestjs/common';

/**
 * A message the platform writes on WhatsApp: text, optionally with up to 3 reply buttons or a
 * list of up to 10 options (Meta's interactive messages). People can also type the number of an
 * option, so every message reads well as plain text too.
 */
export interface OutgoingMessage {
  text: string;
  buttons?: { id: string; title: string }[];
  list?: { button: string; rows: { id: string; title: string; description?: string }[] };
}

export interface WhatsappSender {
  /** `to` in E.164. Returns Meta's message id, or null when nothing was sent. */
  send(to: string, message: OutgoingMessage): Promise<string | null>;
}

export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

/** Meta's limits: button titles 20 characters, list rows 24 (title) and 72 (description). */
const cut = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** The message as plain text: what the console prints and what a phone without buttons shows. */
export function asText(message: OutgoingMessage): string {
  const options = message.buttons ?? message.list?.rows ?? [];
  if (!options.length) return message.text;
  const lines = options.map((o, i) => {
    const description = 'description' in o && o.description ? ` (${o.description})` : '';
    return `${i + 1}. ${o.title}${description}`;
  });
  return `${message.text}\n\n${lines.join('\n')}`;
}

/** The body of Meta's `POST /{phone-number-id}/messages`. */
export function cloudPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/^\+/, ''),
  };
  if (message.buttons?.length) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cut(message.text, 1024) },
        action: {
          buttons: message.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: cut(b.title, 20) },
          })),
        },
      },
    };
  }
  if (message.list?.rows.length) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: cut(message.text, 1024) },
        action: {
          button: cut(message.list.button, 20),
          sections: [
            {
              rows: message.list.rows.slice(0, 10).map((r) => ({
                id: r.id,
                title: cut(r.title, 24),
                ...(r.description ? { description: cut(r.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    };
  }
  return { ...base, type: 'text', text: { body: cut(message.text, 4096), preview_url: true } };
}

/** Meta's WhatsApp Cloud API (graph.facebook.com). */
export class CloudWhatsappSender implements WhatsappSender {
  constructor(
    private readonly options: { phoneNumberId: string; accessToken: string; graphVersion: string },
  ) {}

  async send(to: string, message: OutgoingMessage): Promise<string | null> {
    const { phoneNumberId, accessToken, graphVersion } = this.options;
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(cloudPayload(to, message)),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      // Meta's error text, never the token.
      const detail = await response.text().catch(() => '');
      throw new Error(`WhatsApp Cloud API answered ${response.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await response.json()) as { messages?: { id?: string }[] };
    return body.messages?.[0]?.id ?? null;
  }
}

/** Development and tests: prints the message and keeps it in memory. */
export class ConsoleWhatsappSender implements WhatsappSender {
  private readonly logger = new Logger('WhatsappConsole');
  readonly sent: { to: string; message: OutgoingMessage }[] = [];

  async send(to: string, message: OutgoingMessage): Promise<string | null> {
    this.sent.push({ to, message });
    this.logger.warn(`[DEV ONLY] WhatsApp to ${to}:\n${asText(message)}`);
    return null;
  }
}

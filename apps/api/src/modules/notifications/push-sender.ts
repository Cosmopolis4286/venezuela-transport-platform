import { Logger } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Lets the app open the right screen, e.g. `{ bookingId }`. */
  data?: Record<string, string>;
}

/** Sends push notifications; returns the tokens the service says are no longer valid. */
export interface PushSender {
  readonly enabled: boolean;
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** DEVELOPMENT ONLY: writes the notification to the log. Refused in production. */
export class ConsolePushSender implements PushSender {
  readonly enabled = true;
  private readonly logger = new Logger('PushConsole');

  async send(messages: PushMessage[]) {
    for (const m of messages)
      this.logger.warn(`[DEV ONLY] push to ${m.to}: ${m.title} — ${m.body}`);
    return { invalidTokens: [] };
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** The Expo push service: one HTTPS call per 100 messages, no SDK. */
export class ExpoPushSender implements PushSender {
  readonly enabled = true;

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(messages: PushMessage[]) {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const response = await this.fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
      });
      if (!response.ok) throw new Error(`Expo push service answered ${response.status}`);
      const { data } = (await response.json()) as { data: ExpoTicket[] };
      data.forEach((ticket, j) => {
        if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[j]!.to);
      });
    }
    return { invalidTokens };
  }
}

export class DisabledPushSender implements PushSender {
  readonly enabled = false;
  async send() {
    return { invalidTokens: [] };
  }
}

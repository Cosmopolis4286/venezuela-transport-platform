/**
 * What a person sent, from Meta's webhook payload (`entry[].changes[].value.messages[]`): typed
 * text, a tapped button or list option, or a shared location.
 */
export interface InboundMessage {
  /** Meta's message id: deliveries are retried, so it is seen once. */
  id: string;
  /** E.164, e.g. +584141234567. */
  phone: string;
  profileName: string | null;
  kind: 'text' | 'choice' | 'location' | 'other';
  /** Typed text, or the title of the option tapped. */
  text: string;
  /** The option's id (`kind: 'choice'`). */
  choiceId: string | null;
  location: { latitude: number; longitude: number; label: string | null } | null;
}

interface MetaMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { payload?: string; text?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
}

interface MetaPayload {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: MetaMessage[];
      };
    }[];
  }[];
}

/** The messages in a webhook call; delivery receipts and anything malformed are skipped. */
export function parseInbound(payload: unknown): InboundMessage[] {
  const body = payload as MetaPayload;
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];
  const out: InboundMessage[] = [];
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages' || !change.value) continue;
      const names = new Map(
        (change.value.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? null]),
      );
      for (const m of change.value.messages ?? []) {
        if (!m.id || !m.from || !/^\d{8,15}$/.test(m.from)) continue;
        const base = {
          id: m.id,
          phone: `+${m.from}`,
          profileName: names.get(m.from)?.trim().slice(0, 80) || null,
          choiceId: null,
          location: null,
        };
        const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
        if (m.type === 'text' && m.text?.body) {
          out.push({ ...base, kind: 'text', text: m.text.body.trim().slice(0, 1000) });
        } else if (m.type === 'interactive' && reply?.id) {
          out.push({ ...base, kind: 'choice', text: reply.title ?? '', choiceId: reply.id });
        } else if (m.type === 'button' && m.button?.payload) {
          out.push({
            ...base,
            kind: 'choice',
            text: m.button.text ?? '',
            choiceId: m.button.payload,
          });
        } else if (
          m.type === 'location' &&
          typeof m.location?.latitude === 'number' &&
          typeof m.location.longitude === 'number'
        ) {
          const label = [m.location.name, m.location.address].filter(Boolean).join(', ') || null;
          out.push({
            ...base,
            kind: 'location',
            text: label ?? '',
            location: { latitude: m.location.latitude, longitude: m.location.longitude, label },
          });
        } else {
          out.push({ ...base, kind: 'other', text: '' });
        }
      }
    }
  }
  return out;
}

/** Lower case, no accents, single spaces: how typed answers are compared. */
export function plain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

import { toNetworkIso, type BcvRateSource } from '@vtp/shared-types';

/** One official rate as a source publishes it. */
export interface FetchedRate {
  /** The BCV's "fecha valor" (YYYY-MM-DD): the day it applies from. */
  date: string;
  /** Bolívares per US dollar, with 6 decimals. */
  unitsPerUsd: string;
}

export interface BcvRateFetcher {
  readonly source: Exclude<BcvRateSource, 'manual'>;
  fetch(): Promise<FetchedRate>;
}

export const BCV_RATE_FETCHERS = Symbol('BCV_RATE_FETCHERS');

const TIMEOUT_MS = 15_000;
const HEADERS = { 'user-agent': 'VTP-rate-sync/1.0', accept: 'text/html,application/json' };

/**
 * `"36,03380000"` or `"1.234,56"` (Venezuelan format) → `"36.033800"`: thousands dots dropped,
 * the decimal comma read, rounded half-up to 6 decimals. Null when it is not a positive number.
 */
export function bolivarAmount(text: string): string | null {
  const value = text.trim().replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(/\./g, '').split(',');
  const scaled = BigInt(`${whole}${fraction.padEnd(7, '0').slice(0, 7)}`);
  const rounded = (scaled + 5n) / 10n; // 7 decimals → 6, half up
  if (rounded <= 0n) return null;
  const digits = rounded.toString().padStart(7, '0');
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

/**
 * The home page of bcv.org.ve: the dollar is in `<div id="dolar"> … <strong> 36,03380000 </strong>`
 * and the date in "Fecha Valor: <span … content="2026-11-21T00:00:00-04:00">".
 */
export function parseBcvHomePage(html: string): FetchedRate {
  const dollar = /id=["']dolar["'][\s\S]{0,2000}?<strong>\s*([\d.,\s]+?)\s*<\/strong>/i.exec(html);
  if (!dollar) throw new Error('BCV page: dollar rate not found');
  const unitsPerUsd = bolivarAmount(dollar[1]!);
  if (!unitsPerUsd) throw new Error('BCV page: dollar rate is not a number');
  const date = /Fecha\s+Valor[\s\S]{0,600}?content=["'](\d{4}-\d{2}-\d{2})/i.exec(html);
  if (!date) throw new Error('BCV page: "Fecha Valor" not found');
  return { date: date[1]!, unitsPerUsd };
}

/**
 * DolarApi's `GET /v1/dolares/oficial`: `{ promedio: 36.03, fechaActualizacion: "<ISO>" }`. Its
 * date is when it last changed, which is taken as the day the rate applies from.
 */
export function parseDolarApi(body: unknown): FetchedRate {
  const data = body as { promedio?: unknown; fechaActualizacion?: unknown };
  if (typeof data?.promedio !== 'number' || !(data.promedio > 0)) {
    throw new Error('DolarApi: no "promedio"');
  }
  const updated =
    typeof data.fechaActualizacion === 'string' ? Date.parse(data.fechaActualizacion) : NaN;
  if (Number.isNaN(updated)) throw new Error('DolarApi: no "fechaActualizacion"');
  return {
    date: toNetworkIso(updated).slice(0, 10),
    unitsPerUsd: data.promedio.toFixed(6),
  };
}

/** The BCV's own website (no API: its home page is read). */
export class BcvWebsiteFetcher implements BcvRateFetcher {
  readonly source = 'bcv' as const;
  constructor(private readonly url = 'https://www.bcv.org.ve/') {}

  async fetch(): Promise<FetchedRate> {
    const response = await fetch(this.url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`BCV page answered ${response.status}`);
    return parseBcvHomePage(await response.text());
  }
}

/** ve.dolarapi.com, a free service that republishes the BCV's official rate. */
export class DolarApiFetcher implements BcvRateFetcher {
  readonly source = 'dolarapi' as const;
  constructor(private readonly url = 'https://ve.dolarapi.com/v1/dolares/oficial') {}

  async fetch(): Promise<FetchedRate> {
    const response = await fetch(this.url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`DolarApi answered ${response.status}`);
    return parseDolarApi(await response.json());
  }
}

import type { Currency, PaymentCurrency, RateCurrency } from '@vtp/shared-types';

/** Rates are stored with four decimals; amounts with two. Everything is computed in integers. */
const RATE_SCALE = 10_000n;
const RATE_OUTPUT_PLACES = 6;

/** `"36.5"` → 365000n with `places` = 4; `"-1.5"` → -15000n. Throws on anything else. */
export function toScaled(value: string, places: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a decimal: ${value}`);
  const fraction = (match[3] ?? '').padEnd(places, '0');
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) {
    throw new Error(`Too many decimals: ${value}`);
  }
  const magnitude =
    BigInt(match[2]!) * 10n ** BigInt(places) + BigInt(fraction.slice(0, places) || '0');
  return match[1] ? -magnitude : magnitude;
}

export function fromScaled(value: bigint, places: number): string {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const unit = 10n ** BigInt(places);
  return `${sign}${magnitude / unit}.${(magnitude % unit).toString().padStart(places, '0')}`;
}

/** Rounds `numerator / denominator` half up (both positive). */
const divideRounded = (numerator: bigint, denominator: bigint) =>
  (numerator * 2n + denominator) / (denominator * 2n);

/**
 * Converts a fare amount into the currency a payment method receives, through the US dollar.
 * USD and USDT are 1:1; VES and BRL use the operator's rates (units per dollar). Returns null when
 * a needed rate is missing.
 */
export function convert(
  amount: string,
  from: Currency,
  to: PaymentCurrency,
  rates: ReadonlyMap<RateCurrency, string>,
): { amount: string; rate: string | null } | null {
  if (from === to) return { amount: fromScaled(toScaled(amount, 2), 2), rate: null };
  const perUsd = (currency: Currency | PaymentCurrency): bigint | null => {
    if (currency === 'USD' || currency === 'USDT') return RATE_SCALE;
    const rate = rates.get(currency);
    return rate ? toScaled(rate, 4) : null;
  };
  const source = perUsd(from);
  const target = perUsd(to);
  if (!source || !target) return null;
  const cents = divideRounded(toScaled(amount, 2) * target, source);
  const rate =
    source === target && from === 'USD'
      ? null
      : fromScaled(
          divideRounded(target * 10n ** BigInt(RATE_OUTPUT_PLACES), source),
          RATE_OUTPUT_PLACES,
        );
  return { amount: fromScaled(cents, 2), rate };
}

export function compareAmounts(a: string, b: string): number {
  const diff = toScaled(a, 2) - toScaled(b, 2);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

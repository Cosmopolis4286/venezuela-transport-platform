import { Body } from '@vtp/mobile-core';
import { formatMoney, withServiceFee, type Currency } from '@vtp/shared-types';
import { useT } from '@/i18n/use-t';

/** "15.00" → "15", "8.50" → "8,5" in Spanish. */
export function useRateText() {
  const { locale } = useT();
  return (rate: string) => Number(rate).toLocaleString(locale);
}

/**
 * Fares, the platform's service fee on top and the total (ADR-029). `fee` comes from the booking
 * once it exists; before that it is computed exactly as the API will.
 */
export function PriceBreakdown({
  fares,
  rate,
  currency,
  fee,
  total,
  label,
}: {
  fares: string;
  rate: string;
  currency: Currency;
  fee?: string;
  total?: string;
  /** Text before the total, e.g. "Total". */
  label: string;
}) {
  const { t, locale } = useT();
  const rateText = useRateText();
  const computed = withServiceFee(fares, rate);
  const money = (amount: string) => formatMoney(amount, currency, locale);
  const hasFee = Number(rate) > 0;
  return (
    <>
      {hasFee ? (
        <>
          <Body muted>
            {t.fees.fares}: {money(fares)}
          </Body>
          <Body muted>
            {t.fees.serviceFee(rateText(rate))}: {money(fee ?? computed.fee)}
          </Body>
        </>
      ) : null}
      <Body>
        {label}: {money(total ?? computed.total)}
      </Body>
    </>
  );
}

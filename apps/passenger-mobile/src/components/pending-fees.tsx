import { Banner, useApi } from '@vtp/mobile-core';
import { formatMoney, type PendingRideFee } from '@vtp/shared-types';
import { useT } from '@/i18n/use-t';

/** Money owed, e.g. "1,00 USD + 2,00 USD", or null when nothing is owed. */
export function useFeeTotal(fees: { amount: string; currency: PendingRideFee['currency'] }[]) {
  const { locale } = useT();
  if (!fees.length) return null;
  const sums = new Map<string, number>();
  for (const f of fees) sums.set(f.currency, (sums.get(f.currency) ?? 0) + Number(f.amount));
  return [...sums]
    .map(([currency, amount]) =>
      formatMoney(amount.toFixed(2), currency as PendingRideFee['currency'], locale),
    )
    .join(' + ');
}

/**
 * Late-cancellation fees the passenger still owes, shown before asking for a taxi or motorcycle:
 * the next driver collects them in cash with the fare.
 */
export function PendingFeesBanner() {
  const { t } = useT();
  const fees = useApi<PendingRideFee[]>('/me/taxi-fees');
  const total = useFeeTotal(fees.data ?? []);
  return total ? <Banner tone="warning">{t.ride.feesOwed(total)}</Banner> : null;
}

import { formatHoursBefore, MAX_REFUND_TIERS, type RefundTier } from '@vtp/shared-types';
import { Input } from '@/components/ui/input';

/** "100 % hasta 48 h antes · 50 % hasta 2 h antes · después, nada" */
export function describeRefundTiers(tiers: readonly RefundTier[]): string {
  const parts = tiers.map((t) =>
    t.hoursBefore === 0
      ? `${t.percent} % hasta la salida`
      : `${t.percent} % hasta ${formatHoursBefore(t.hoursBefore)} antes`,
  );
  return [...parts, 'después, nada'].join(' · ');
}

/**
 * Rows of hours / percent for a refund policy (`<prefix>Hours:N`, `<prefix>Percent:N`). Hours
 * accept quarters: 0.5 is 30 minutes.
 */
export function RefundTierFields({
  tiers,
  prefix = 'tier',
}: {
  tiers: readonly RefundTier[];
  prefix?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Si el pasajero cancela con al menos estas horas antes de abordar, recibe este porcentaje de
        la tarifa (0,5 horas son 30 minutos). Deja vacías las filas que no uses.
      </p>
      {Array.from({ length: MAX_REFUND_TIERS }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            name={`${prefix}Percent:${i}`}
            inputMode="numeric"
            className="w-20"
            aria-label={`Porcentaje del tramo ${i + 1}${prefix === 'tier' ? '' : ' (suburbano)'}`}
            defaultValue={tiers[i]?.percent ?? ''}
          />
          <span>% si cancela con al menos</span>
          <Input
            name={`${prefix}Hours:${i}`}
            inputMode="decimal"
            className="w-20"
            aria-label={`Horas del tramo ${i + 1}${prefix === 'tier' ? '' : ' (suburbano)'}`}
            defaultValue={tiers[i]?.hoursBefore ?? ''}
          />
          <span>horas de anticipación</span>
        </div>
      ))}
    </div>
  );
}

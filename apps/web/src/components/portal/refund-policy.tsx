import { MAX_REFUND_TIERS, type RefundTier } from '@vtp/shared-types';
import { Input } from '@/components/ui/input';

/** "100 % hasta 48 h antes · 50 % hasta 2 h antes · después, nada" */
export function describeRefundTiers(tiers: readonly RefundTier[]): string {
  const parts = tiers.map((t) =>
    t.hoursBefore === 0
      ? `${t.percent} % hasta la salida`
      : `${t.percent} % hasta ${t.hoursBefore} h antes`,
  );
  return [...parts, 'después, nada'].join(' · ');
}

/** Rows of hours / percent for a refund policy (`tierHours:N`, `tierPercent:N`). */
export function RefundTierFields({ tiers }: { tiers: readonly RefundTier[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Si el pasajero cancela con al menos estas horas antes de abordar, recibe este porcentaje de
        la tarifa. Deja vacías las filas que no uses.
      </p>
      {Array.from({ length: MAX_REFUND_TIERS }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            name={`tierPercent:${i}`}
            inputMode="numeric"
            className="w-20"
            aria-label={`Porcentaje del tramo ${i + 1}`}
            defaultValue={tiers[i]?.percent ?? ''}
          />
          <span>% si cancela con al menos</span>
          <Input
            name={`tierHours:${i}`}
            inputMode="numeric"
            className="w-20"
            aria-label={`Horas del tramo ${i + 1}`}
            defaultValue={tiers[i]?.hoursBefore ?? ''}
          />
          <span>horas de anticipación</span>
        </div>
      ))}
    </div>
  );
}

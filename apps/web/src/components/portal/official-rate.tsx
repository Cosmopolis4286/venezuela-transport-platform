import { BCV_RATE_SOURCE_LABELS, longDate, type BcvRate } from '@vtp/shared-types';
import { Alert } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/labels';
import { apiFetch } from '@/lib/server/api';

/**
 * Bolívar prices always use the BCV's official rate, fetched by the API every few hours
 * (ADR-046): shown here instead of a field to type it.
 */
export async function OfficialRate() {
  const { rate } = await apiFetch<{ rate: BcvRate | null }>('/exchange-rates/official', {
    auth: false,
  });
  if (!rate) {
    return (
      <Alert variant="destructive">
        No hay una tasa reciente del BCV, así que no se ofrece pagar en bolívares. Se actualiza sola
        cada pocas horas; si persiste, avisa a la administración de la plataforma.
      </Alert>
    );
  }
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">Bolívares (Bs.):</span> tasa oficial del BCV,{' '}
        <span className="font-medium">
          {Number(rate.unitsPerUsd).toLocaleString('es-VE', { maximumFractionDigits: 4 })} Bs. por
          dólar
        </span>
        , vigente desde el {longDate(rate.date)}.
      </p>
      <p className="text-xs text-muted-foreground">
        Se actualiza sola · {BCV_RATE_SOURCE_LABELS[rate.source]} · revisada el{' '}
        {formatDateTime(rate.updatedAt)}
      </p>
    </div>
  );
}

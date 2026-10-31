import {
  formatPaymentAmount,
  PAYOUT_METHOD_LABELS,
  type OrganizationSettlement,
  type Payout,
  type SettlementEntry,
} from '@vtp/shared-types';
import { Badge } from '@/components/ui/badge';
import { describeRefundTiers } from '@/components/portal/refund-policy';
import { formatDate } from '@/lib/labels';

const percent = (rate: string) => `${rate.replace('.', ',')} %`;

/** Balance per currency: fares, commission, payouts and what is still owed. */
export function SettlementBalances({ settlement }: { settlement: OrganizationSettlement }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Comisión de la plataforma: <strong>{percent(settlement.commissionRate)}</strong>
        {settlement.commissionOverride ? ' (acordada con la empresa)' : ' (por defecto)'}. Se aplica
        a las reservas pagadas desde que se fija.
      </p>
      <p className="text-sm text-muted-foreground">
        Reembolso si el pasajero cancela: {describeRefundTiers(settlement.refundTiers)}
        {settlement.refundTiersOverride ? ' (acordado con la empresa)' : ' (por defecto)'}. La
        plataforma conserva su comisión; el reembolso se descuenta de lo ganado por la empresa.
      </p>
      {settlement.balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay reservas pagadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-normal">Moneda</th>
                <th className="py-2 pr-4 text-right font-normal">Boletos vendidos</th>
                <th className="py-2 pr-4 text-right font-normal">Comisión</th>
                <th className="py-2 pr-4 text-right font-normal">Para la empresa</th>
                <th className="py-2 pr-4 text-right font-normal">Pagado</th>
                <th className="py-2 text-right font-normal">Saldo por pagar</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {settlement.balances.map((b) => (
                <tr key={b.currency} className="border-t">
                  <td className="py-2 pr-4">{b.currency}</td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.gross, b.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.commission, b.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.earned, b.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.paidOut, b.currency)}
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {formatPaymentAmount(b.balance, b.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Paid bookings of a month, newest first. */
export function SettlementEntries({ entries }: { entries: SettlementEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay reservas pagadas en este mes.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-normal">Pagada</th>
            <th className="py-2 pr-4 font-normal">Reserva</th>
            <th className="py-2 pr-4 font-normal">Ruta y fecha</th>
            <th className="py-2 pr-4 text-right font-normal">Puestos</th>
            <th className="py-2 pr-4 text-right font-normal">Total</th>
            <th className="py-2 pr-4 text-right font-normal">Comisión</th>
            <th className="py-2 text-right font-normal">Para la empresa</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {entries.map((e) => (
            <tr key={e.id} className="border-t">
              <td className="py-2 pr-4">{formatDate(e.createdAt)}</td>
              <td className="py-2 pr-4">
                {e.bookingCode}
                {e.kind === 'cancellation' ? (
                  <span className="text-muted-foreground"> · cancelada</span>
                ) : null}
              </td>
              <td className="py-2 pr-4">
                {e.route.name} · {formatDate(`${e.serviceDate}T12:00:00-04:00`)}
              </td>
              <td className="py-2 pr-4 text-right">{e.seats}</td>
              <td className="py-2 pr-4 text-right">{formatPaymentAmount(e.gross, e.currency)}</td>
              <td className="py-2 pr-4 text-right">
                {formatPaymentAmount(e.commission, e.currency)} ({percent(e.commissionRate)})
              </td>
              <td className="py-2 text-right">{formatPaymentAmount(e.earned, e.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One payout line; `children` holds staff-only controls (void). */
export function PayoutLine({ payout, children }: { payout: Payout; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-medium tabular-nums ${payout.voidedAt ? 'text-muted-foreground line-through' : ''}`}
        >
          {formatPaymentAmount(payout.amount, payout.currency)}
        </span>
        <span className="text-sm text-muted-foreground">
          {PAYOUT_METHOD_LABELS[payout.method]} · ref. {payout.reference} ·{' '}
          {formatDate(payout.createdAt)}
        </span>
        {payout.voidedAt ? <Badge variant="secondary">Anulado</Badge> : null}
      </div>
      {payout.note ? <p className="text-sm">{payout.note}</p> : null}
      {payout.voidReason ? (
        <p className="text-sm text-muted-foreground">Motivo de la anulación: {payout.voidReason}</p>
      ) : null}
      {children}
    </li>
  );
}

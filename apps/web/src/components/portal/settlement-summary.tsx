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

/** A positive balance is owed to the operator; a negative one, by the operator to the platform. */
function balanceText(balance: string, currency: Parameters<typeof formatPaymentAmount>[1]) {
  return balance.startsWith('-')
    ? `Debe ${formatPaymentAmount(balance.slice(1), currency)}`
    : formatPaymentAmount(balance, currency);
}

/** Balance per currency: fares, commission, payouts and what is still owed. */
export function SettlementBalances({
  settlement,
  onDemand = false,
}: {
  settlement: OrganizationSettlement;
  /** A taxi or motorcycle line: explain the late-cancellation fee. */
  onDemand?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Comisión de la plataforma: <strong>{percent(settlement.commissionRate)}</strong>
        {settlement.commissionOverride ? ' (acordada con la empresa)' : ' (por defecto)'}. Se aplica
        a las reservas pagadas desde que se fija.
      </p>
      <p className="text-sm text-muted-foreground">
        Reembolso si el pasajero cancela: {describeRefundTiers(settlement.refundTiers)}
        {settlement.refundTiersOverride ? ' (acordado con la empresa)' : ' (por defecto)'}; en rutas
        suburbanas, {describeRefundTiers(settlement.suburbanRefundTiers)}. La plataforma conserva su
        comisión; el reembolso se descuenta de lo ganado por la empresa.
      </p>
      <p className="text-sm text-muted-foreground">
        {settlement.paymentCollection === 'operator'
          ? 'Cobros: la empresa recibe los pagos en sus propias cuentas, los verifica, hace sus reembolsos y le paga la comisión a la plataforma.'
          : 'Cobros: la plataforma recibe los pagos de los pasajeros y le paga a la empresa lo que gana.'}
      </p>
      {onDemand ? (
        <p className="text-sm text-muted-foreground">
          Taxis y motos por tramo: si el pasajero cancela más de{' '}
          {settlement.rideCancellation.freeMinutes} min después de que la línea tomó el viaje, debe
          una tasa del {settlement.rideCancellation.feePercent} % de la tarifa. La cobra en efectivo
          el conductor de su próximo viaje; si es de otra línea, se la descontamos a esa y se la
          pagamos a la que salió a buscarlo, menos la comisión.
        </p>
      ) : null}
      {settlement.acceptsTripPacks ? (
        <p className="text-sm text-muted-foreground">
          Acepta paquetes de viajes: por cada viaje usado gana su tarifa normal del tramo, menos la
          comisión, aunque la plataforma cobró el paquete.
        </p>
      ) : null}
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
                <th className="py-2 pr-4 text-right font-normal">Cobrado por la empresa</th>
                <th className="py-2 pr-4 text-right font-normal">Pagado a la empresa</th>
                <th className="py-2 pr-4 text-right font-normal">Pagado por la empresa</th>
                <th className="py-2 text-right font-normal">Saldo</th>
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
                    {formatPaymentAmount(b.collected, b.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.paidOut, b.currency)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPaymentAmount(b.received, b.currency)}
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {balanceText(b.balance, b.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-2 text-xs text-muted-foreground">
            Saldo = para la empresa − cobrado por la empresa − pagado a la empresa + pagado por la
            empresa. «Debe» es lo que la empresa le debe a la plataforma (su comisión).
          </p>
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
                {e.kind === 'ride_cancellation_fee' ? (
                  <span className="text-muted-foreground"> · tasa de cancelación</span>
                ) : null}
                {e.collectedBy === 'operator' ? (
                  <span className="text-muted-foreground"> · cobró la empresa</span>
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
          {payout.direction === 'from_operator' ? 'De la empresa a la plataforma · ' : ''}
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

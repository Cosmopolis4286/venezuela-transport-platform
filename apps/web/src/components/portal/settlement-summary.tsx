import {
  formatPaymentAmount,
  PAYOUT_METHOD_LABELS,
  type DriverBalance,
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
export function SettlementBalances({ settlement }: { settlement: OrganizationSettlement }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cargo por servicio de la plataforma: <strong>{percent(settlement.commissionRate)}</strong>
        {settlement.commissionOverride ? ' (acordado con la empresa)' : ' (por defecto)'}, que paga
        el pasajero además de la tarifa: la empresa recibe su tarifa completa. Se aplica a las
        reservas hechas desde que se fija.
      </p>
      <p className="text-sm text-muted-foreground">
        Reembolso si el pasajero cancela: {describeRefundTiers(settlement.refundTiers)}
        {settlement.refundTiersOverride ? ' (acordado con la empresa)' : ' (por defecto)'}; en rutas
        suburbanas, {describeRefundTiers(settlement.suburbanRefundTiers)}. Se aplican a la tarifa;
        el cargo por servicio no se reembolsa. Si la empresa cancela la salida, el pasajero recibe
        todo y la empresa asume el cargo por servicio.
      </p>
      <p className="text-sm text-muted-foreground">
        {settlement.paymentCollection === 'operator'
          ? 'Cobros: la empresa recibe los pagos en sus propias cuentas (tarifa y cargo por servicio), los verifica, hace sus reembolsos y le paga a la plataforma el cargo por servicio.'
          : 'Cobros: la plataforma recibe los pagos de los pasajeros y le paga a la empresa lo que gana.'}
      </p>
      {settlement.balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay reservas pagadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-normal">Moneda</th>
                <th className="py-2 pr-4 text-right font-normal">Pagado por pasajeros</th>
                <th className="py-2 pr-4 text-right font-normal">Cargo por servicio</th>
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
            empresa. «Debe» es lo que la empresa le debe a la plataforma (el cargo por servicio que
            cobró).
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Fares of routes paid to drivers (ADR-030), per driver and currency. `pay` renders the admin's
 * payout form for one row (platform staff only).
 */
export function DriverBalances({
  drivers,
  pay,
}: {
  drivers: DriverBalance[];
  pay?: (row: DriverBalance) => React.ReactNode;
}) {
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ninguna ruta le paga a sus conductores todavía (se elige en cada ruta: las urbanas y
        suburbanas les pagan por defecto).
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {drivers.map((row) => (
        <li
          key={`${row.driver?.id ?? 'none'}:${row.currency}`}
          className="flex flex-col gap-2 py-3 text-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {row.driver ? row.driver.name : 'Viajes sin conductor asignado'}
            </span>
            <span className="tabular-nums">
              Ganado {formatPaymentAmount(row.earned, row.currency)} · pagado{' '}
              {formatPaymentAmount(row.paidOut, row.currency)} · saldo{' '}
              <strong>{formatPaymentAmount(row.balance, row.currency)}</strong>
            </span>
          </div>
          {row.driver ? (
            <p className="text-muted-foreground">
              {row.payoutAccount
                ? `Cobra por ${PAYOUT_METHOD_LABELS[row.payoutAccount.method]}: ${row.payoutAccount.bank} · ${row.payoutAccount.account} · ${row.payoutAccount.holderId} · ${row.payoutAccount.holderName}`
                : 'Aún no indicó dónde cobrar (lo hace en la app de transportistas).'}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Se le pagan al conductor que el despacho asigne a cada viaje.
            </p>
          )}
          {row.driver && pay && Number(row.balance) > 0 ? pay(row) : null}
        </li>
      ))}
    </ul>
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
            <th className="py-2 pr-4 text-right font-normal">Pagado</th>
            <th className="py-2 pr-4 text-right font-normal">Cargo por servicio</th>
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
          {payout.driver ? `Al conductor ${payout.driver.name} · ` : ''}
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

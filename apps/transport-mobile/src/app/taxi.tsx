import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Screen,
  Segmented,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import {
  TAXI_RIDE_STATUS_LABELS,
  formatMoney,
  localPhone,
  vehicleName,
  type Currency,
  type DriverTaxiBoard,
  type OperatorTaxiRide,
  type TaxiRequest,
} from '@vtp/shared-types';
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { parseFare, requestSummary, rideRoute, feesNotice } from '@/lib/taxi-board';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** New requests and the current ride's status are reloaded this often. */
const POLL_MS = 5000;
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'US$' },
  { value: 'VES', label: 'Bs.' },
] as const satisfies readonly { value: Currency; label: string }[];

/** Taxi drivers: take a request at the terminal, then pick up and drop off the passenger. */
export default function TaxiScreen() {
  const { api } = useAuth();
  const board = useApi<DriverTaxiBoard>('/me/taxi');
  const { reload } = board;
  useRefreshOnFocus(reload);
  const [taking, setTaking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Pause polling while the driver is filling in the fare.
  useEffect(() => {
    if (taking) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [taking, reload]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'success', text: success });
      setTaking(null);
    } catch (e) {
      setMessage({ tone: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const step = (
    ride: OperatorTaxiRide,
    name: 'pickup' | 'complete' | 'release',
    text: string,
    body?: { feesCollected: boolean } | { pickupCode: string },
  ) =>
    run(
      () =>
        api.request(`/me/taxi/rides/${ride.id}/${name}`, {
          method: 'POST',
          ...(body ? { body } : {}),
        }),
      text,
    );

  const data = board.data;
  const current = data?.current;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={board.loading} onRefresh={() => void reload()} />}
    >
      {board.error ? <Banner tone="error">{board.error.userMessage}</Banner> : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {current ? (
        <>
          <Heading>Tu viaje</Heading>
          <Card>
            <Badge label={TAXI_RIDE_STATUS_LABELS[current.status]} tone="success" />
            <Body>{rideRoute(current)}</Body>
            <Body>
              {[current.passenger.firstName, current.passenger.lastName]
                .filter(Boolean)
                .join(' ') || 'Pasajero'}
              {current.passenger.phone ? ` · ${localPhone(current.passenger.phone)}` : ''}
            </Body>
            <Body muted>
              {current.passengers} {current.passengers === 1 ? 'pasajero' : 'pasajeros'}
              {current.notes ? ` · ${current.notes}` : ''}
            </Body>
            <Body muted>
              {vehicleName(current.vehicle)} · Tarifa{' '}
              {formatMoney(current.fare.amount, current.fare.currency)}
            </Body>
            {feesNotice(current.feesDue) ? (
              <Banner tone="warning">{feesNotice(current.feesDue)}</Banner>
            ) : null}
            {current.paidWithPack ? (
              <Banner tone="info">
                Pagado con paquete de viajes: no le cobres al pasajero. La plataforma le paga la
                tarifa a tu línea.
              </Banner>
            ) : null}
            {current.status === 'accepted' ? (
              <>
                {/* Paid with a pack: the passenger tells the code shown in their app. */}
                {current.paidWithPack ? (
                  <Field
                    label="Código del pasajero"
                    placeholder="4 dígitos de su app"
                    value={pickupCode}
                    onChangeText={setPickupCode}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                ) : null}
                <Button
                  title="Pasajero a bordo"
                  loading={busy}
                  disabled={current.paidWithPack && !/^\d{4}$/.test(pickupCode)}
                  onPress={() =>
                    void step(
                      current,
                      'pickup',
                      'Buen viaje.',
                      current.paidWithPack ? { pickupCode } : undefined,
                    )
                  }
                />
                <Button
                  variant="secondary"
                  title="No puedo hacer este viaje"
                  disabled={busy}
                  onPress={() =>
                    void step(current, 'release', 'Liberaste el viaje; otro taxi lo puede tomar.')
                  }
                />
              </>
            ) : (
              <>
                <Button
                  title={
                    current.feesDue.length ? 'Terminar viaje (cobré la tasa)' : 'Terminar viaje'
                  }
                  loading={busy}
                  onPress={() => void step(current, 'complete', 'Viaje terminado.')}
                />
                {/* The passenger did not pay the earlier fee: it stays owed, the line owes nothing. */}
                {current.feesDue.length ? (
                  <Button
                    variant="secondary"
                    title="Terminar sin cobrar la tasa"
                    disabled={busy}
                    onPress={() =>
                      void step(
                        current,
                        'complete',
                        'Viaje terminado. La tasa queda pendiente para el próximo viaje del pasajero.',
                        { feesCollected: false },
                      )
                    }
                  />
                ) : null}
              </>
            )}
          </Card>
        </>
      ) : null}
      {data?.upcoming.length ? (
        <>
          <Heading>Viajes programados</Heading>
          {data.upcoming.map((ride) => (
            <Card key={ride.id}>
              <Body>{rideRoute(ride)}</Body>
              <Body muted>{requestSummary(ride)}</Body>
              <Body muted>
                {[ride.passenger.firstName, ride.passenger.lastName].filter(Boolean).join(' ') ||
                  'Pasajero'}
                {ride.passenger.phone ? ` · ${localPhone(ride.passenger.phone)}` : ''} ·{' '}
                {formatMoney(ride.fare.amount, ride.fare.currency)}
              </Body>
            </Card>
          ))}
        </>
      ) : null}
      {!current && data ? (
        <>
          <Heading>Solicitudes de taxi</Heading>
          {data.lines.length === 0 ? (
            <Body muted>
              Solo los conductores de una línea de taxis o de mototaxis activa ven las solicitudes.
            </Body>
          ) : data.requests.length === 0 ? (
            <Body muted>
              No hay solicitudes en tus terminales ni en tus tramos. Esta lista se actualiza sola.
            </Body>
          ) : (
            data.requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                board={data}
                open={taking === request.id}
                busy={busy}
                onOpen={() => {
                  setMessage(null);
                  setTaking(taking === request.id ? null : request.id);
                }}
                onAccept={(body) =>
                  run(
                    () =>
                      api.request(`/me/taxi/rides/${request.id}/accept`, { method: 'POST', body }),
                    'Tomaste el viaje. El pasajero ya ve tu placa y la tarifa.',
                  )
                }
              />
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

function RequestCard({
  request,
  board,
  open,
  busy,
  onOpen,
  onAccept,
}: {
  request: TaxiRequest;
  board: DriverTaxiBoard;
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onAccept: (body: {
    organizationId: string;
    vehicleId: string;
    fareAmount?: string;
    fareCurrency?: Currency;
  }) => Promise<void>;
}) {
  const [lineId, setLineId] = useState(board.lines[0]?.organization.id ?? '');
  const line = board.lines.find((l) => l.organization.id === lineId) ?? board.lines[0];
  const [vehicleId, setVehicleId] = useState(line?.vehicles[0]?.id ?? '');
  const [fare, setFare] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const amount = parseFare(fare);
  // Stretch rides cost the line's fixed fare for the stretch: nothing to type (ADR-028).
  const fixedFare = request.kind === 'stretch';
  const vehicle = line?.vehicles.find((v) => v.id === vehicleId) ?? line?.vehicles[0];

  return (
    <Card>
      <Body>{rideRoute(request)}</Body>
      <Body muted>{requestSummary(request)}</Body>
      {request.paidWithPack ? <Badge label="Pagado con paquete" tone="success" /> : null}
      {feesNotice(request.feesDue) ? <Body muted>{feesNotice(request.feesDue)}</Body> : null}
      {request.passengerFirstName || request.notes ? (
        <Body muted>{[request.passengerFirstName, request.notes].filter(Boolean).join(' · ')}</Body>
      ) : null}
      {open && line ? (
        <>
          {board.lines.length > 1 ? (
            <Segmented
              label="Línea"
              options={board.lines.map((l) => ({
                value: l.organization.id,
                label: l.organization.tradeName ?? l.organization.legalName,
              }))}
              value={line.organization.id}
              onChange={(id) => {
                setLineId(id);
                setVehicleId(
                  board.lines.find((l) => l.organization.id === id)?.vehicles[0]?.id ?? '',
                );
              }}
            />
          ) : null}
          {line.vehicles.length ? (
            <Segmented
              label="Vehículo"
              options={line.vehicles.map((v) => ({ value: v.id, label: v.plate }))}
              value={vehicle!.id}
              onChange={setVehicleId}
            />
          ) : (
            <Banner tone="warning">Tu línea no tiene vehículos activos registrados.</Banner>
          )}
          {fixedFare ? (
            <Body muted>Se cobra la tarifa de tu línea para este tramo.</Body>
          ) : (
            <>
              <Segmented
                label="Moneda"
                options={CURRENCY_OPTIONS}
                value={currency}
                onChange={setCurrency}
              />
              <Field
                label="Tarifa"
                placeholder="8,00"
                keyboardType="decimal-pad"
                value={fare}
                onChangeText={setFare}
                error={
                  fare && !amount
                    ? 'Escribe un monto mayor que cero, con hasta dos decimales.'
                    : undefined
                }
              />
            </>
          )}
          <Button
            title="Tomar el viaje"
            loading={busy}
            disabled={(!fixedFare && !amount) || !vehicle}
            onPress={() =>
              void onAccept({
                organizationId: line.organization.id,
                vehicleId: vehicle!.id,
                ...(fixedFare ? {} : { fareAmount: amount!, fareCurrency: currency }),
              })
            }
          />
          <Button variant="link" title="Cancelar" onPress={onOpen} />
        </>
      ) : (
        <Button variant="secondary" title="Tomar" disabled={busy} onPress={onOpen} />
      )}
    </Card>
  );
}

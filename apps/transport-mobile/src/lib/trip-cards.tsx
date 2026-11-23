import { Badge, Banner, Body, Button, Card, Field, Row, Subheading } from '@vtp/mobile-core';
import { networkClock, normalizePin, WAIT_AT_STOP_MINUTES } from '@vtp/shared-types';
import { useState } from 'react';
import { clock, waitLeft, type PickupStop } from './pickup';
import { ResultCard } from './result-card';
import { useTicketCheck } from './use-ticket-check';

/**
 * The passenger says their 4-digit PIN and the driver types it (ADR-052): checked online, or with
 * the tickets saved on the phone when there is no signal.
 */
export function PinCheck({
  organizationId,
  tripId,
  onBoarded,
}: {
  organizationId: string;
  tripId: string;
  onBoarded: () => void;
}) {
  const [pin, setPin] = useState('');
  const { validate, reset, result, error, busy, offline, listAt } = useTicketCheck(organizationId);
  const ready = normalizePin(pin) !== null;

  const check = async () => {
    await validate({ tripId, pin });
    onBoarded();
  };
  const next = () => {
    reset();
    setPin('');
  };

  return (
    <Card>
      <Subheading>Validar con PIN</Subheading>
      {result || error ? (
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {result && offline ? (
            <Banner tone="info">
              Validado sin señal con la lista de las {listAt}. Se enviará solo al volver la señal.
            </Banner>
          ) : null}
          {result ? <ResultCard result={result} /> : null}
          <Button title="Siguiente pasajero" onPress={next} />
        </>
      ) : (
        <>
          <Field
            label="PIN de 4 dígitos que te dice el pasajero"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="0427"
          />
          <Button
            title="Validar PIN"
            loading={busy}
            disabled={!ready}
            onPress={() => void check()}
          />
        </>
      )}
    </Card>
  );
}

/**
 * One stop of the pickup list (ADR-052): who boards there, and "Llegué" to tell them the car
 * waits {@link WAIT_AT_STOP_MINUTES} minutes, with the countdown.
 */
export function PickupStopCard({
  pickup,
  arrivedAt,
  now,
  canArrive,
  busy,
  notice,
  onArrive,
}: {
  pickup: PickupStop;
  /** When the driver said "Llegué" here (from the API, or on this phone without signal). */
  arrivedAt: string | null;
  now: number;
  canArrive: boolean;
  busy: boolean;
  notice: string | null;
  onArrive: () => void;
}) {
  const left = arrivedAt ? waitLeft(arrivedAt, now) : 0;
  const boarding = pickup.waiting.length + pickup.boarded.length + pickup.unpaid.length;
  return (
    <Card>
      <Row>
        <Subheading>{pickup.stop.name}</Subheading>
        {pickup.waiting.length ? (
          <Badge label={`${pickup.waiting.length} por subir`} tone="warning" />
        ) : boarding ? (
          <Badge label="Todos a bordo" tone="success" />
        ) : null}
      </Row>
      {pickup.alighting ? <Body muted>Bajan aquí: {pickup.alighting}</Body> : null}
      {pickup.waiting.map((p) => (
        <Body key={p.seatNumber}>
          Puesto {p.seatNumber} · {p.firstName} {p.lastName}
        </Body>
      ))}
      {pickup.boarded.map((p) => (
        <Body key={p.seatNumber} muted>
          Puesto {p.seatNumber} · {p.firstName} {p.lastName} · abordó {networkClock(p.boardedAt!)}
        </Body>
      ))}
      {pickup.unpaid.map((p) => (
        <Body key={p.seatNumber} muted>
          Puesto {p.seatNumber} · {p.firstName} {p.lastName} · sin pagar
        </Body>
      ))}
      {arrivedAt ? (
        left > 0 ? (
          <Banner tone="warning">
            Esperando {clock(left)} de {WAIT_AT_STOP_MINUTES} minutos.
          </Banner>
        ) : (
          <Body muted>Llegaste a las {networkClock(arrivedAt)}; la espera ya se cumplió.</Body>
        )
      ) : canArrive && pickup.waiting.length ? (
        <Button
          variant="secondary"
          title={`Llegué: esperar ${WAIT_AT_STOP_MINUTES} minutos`}
          loading={busy}
          onPress={onArrive}
        />
      ) : null}
      {notice ? <Body muted>{notice}</Body> : null}
    </Card>
  );
}

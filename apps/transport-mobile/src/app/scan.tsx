import {
  ApiError,
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Row,
  Screen,
  Subheading,
  useAuth,
  useColors,
  userMessage,
} from '@vtp/mobile-core';
import {
  localTime,
  networkClock,
  ticketIdFromQr,
  type TicketValidation,
  type ValidateTicketRequest,
} from '@vtp/shared-types';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { updateOffline, useOfflineSync, useOfflineTickets } from '@/lib/offline-store';
import {
  checkOffline,
  OFFLINE_LIST_STALE_MS,
  withBoarding,
  withOnlineBoarding,
} from '@/lib/offline-tickets';
import { ticketErrorMessage, ticketVerdict } from '@/lib/ticket-result';

/** The same code read again within this time is ignored (the camera reports it many times). */
const REPEAT_MS = 4000;
/** Without an answer by then, the ticket is checked against the list kept on the phone. */
const ONLINE_TIMEOUT_MS = 8000;

class NoAnswer extends Error {}
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new NoAnswer()), ms)),
  ]);
const noSignal = (e: unknown) =>
  e instanceof NoAnswer || (e instanceof ApiError && e.code === 'NETWORK');

/**
 * Boarding: scan the passenger's QR (or type the booking code and seat) and show at once whether
 * they may board. The first valid scan marks the passenger as boarded.
 */
export default function ScanScreen() {
  const { organizationId, name } = useLocalSearchParams<{
    organizationId: string;
    name?: string;
  }>();
  const { api } = useAuth();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<TicketValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState('');
  const [offline, setOffline] = useState(false);
  const lastScan = useRef<{ data: string; at: number } | null>(null);
  // The line's tickets stay on the phone to check them without signal (ADR-049).
  const saved = useOfflineTickets(organizationId);
  useOfflineSync(api, organizationId);
  const listAt = saved.list ? networkClock(saved.list.generatedAt) : null;
  // Re-checked every minute: a list kept too long may miss tickets sold later.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const stale =
    saved.list !== null && now - Date.parse(saved.list.generatedAt) > OFFLINE_LIST_STALE_MS;

  /** Without signal: the list on the phone, and the boarding is sent when the signal is back. */
  const validateOffline = (body: ValidateTicketRequest) => {
    const checked = checkOffline(saved, body, Date.now());
    if (!checked) {
      setResult(null);
      setError(
        saved.list
          ? `Sin señal, y este boleto no está en la lista guardada (de las ${listAt}). Si lo compró hace poco, pide que espere a que vuelva la señal o cóbrale en efectivo.`
          : 'Sin señal, y todavía no hay boletos guardados en este teléfono. Abre la app con señal antes de salir.',
      );
      return;
    }
    if (checked.boarding) {
      const boarding = checked.boarding;
      updateOffline(organizationId, (kept) => withBoarding(kept, boarding));
    }
    setOffline(true);
    setResult(checked.validation);
  };

  const validate = async (body: ValidateTicketRequest) => {
    setBusy(true);
    setError(null);
    setOffline(false);
    try {
      const validation = await withTimeout(
        api.request<TicketValidation>(`/organizations/${organizationId}/tickets/validate`, {
          method: 'POST',
          body,
        }),
        ONLINE_TIMEOUT_MS,
      );
      // Not accepted again on this phone if the signal goes.
      const ticketId =
        'qr' in body
          ? ticketIdFromQr(body.qr)
          : saved.list?.tickets.find(
              (t) =>
                t.bookingCode === validation.bookingCode && t.seatNumber === validation.seatNumber,
            )?.ticketId;
      if (validation.result === 'boarded' && ticketId) {
        updateOffline(organizationId, (kept) =>
          withOnlineBoarding(kept, ticketId, validation.boardedAt ?? new Date().toISOString()),
        );
      }
      setResult(validation);
    } catch (e) {
      if (noSignal(e)) {
        validateOffline(body);
      } else {
        setResult(null);
        setError(
          e instanceof ApiError ? ticketErrorMessage(e.status, userMessage(e)) : userMessage(e),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    const last = lastScan.current;
    if (busy || result || error || (last && last.data === data && now - last.at < REPEAT_MS)) {
      return;
    }
    lastScan.current = { data, at: now };
    void validate({ qr: data });
  };

  const next = () => {
    setResult(null);
    setError(null);
    setOffline(false);
    setCode('');
    setSeat('');
  };

  const showing = result !== null || error !== null;

  return (
    <Screen>
      {name ? <Body muted>{name}</Body> : null}
      <Body muted>
        {saved.list
          ? `Sin señal se valida con la lista guardada: ${saved.list.tickets.length} boletos, de las ${listAt}.`
          : 'Guardando los boletos para validar sin señal…'}
        {saved.pending.length ? ` ${saved.pending.length} por enviar.` : ''}
      </Body>
      {stale ? (
        <Banner tone="warning">
          La lista guardada tiene más de 3 horas: puede faltar algún boleto vendido después.
        </Banner>
      ) : null}

      {showing ? (
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {result && offline ? (
            <Banner tone="info">
              Validado sin señal con la lista de las {listAt}. Se enviará solo al volver la señal.
            </Banner>
          ) : null}
          {result ? <ResultCard result={result} /> : null}
          <Button title="Validar siguiente" onPress={next} />
        </>
      ) : (
        <>
          <Subheading>Escanea el código QR del boleto</Subheading>
          {!permission ? null : permission.granted ? (
            <View
              style={{
                height: 320,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: colors.surface,
              }}
            >
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onScanned}
              />
            </View>
          ) : (
            <Card>
              <Body>
                Para leer los boletos, la app necesita usar la cámara. Solo se usa en esta pantalla.
              </Body>
              {permission.canAskAgain ? (
                <Button title="Permitir cámara" onPress={() => void requestPermission()} />
              ) : (
                <Body muted>
                  Activa el permiso de cámara para VTP Transportistas en los ajustes del teléfono.
                </Body>
              )}
            </Card>
          )}
          {busy ? <Body muted>Validando…</Body> : null}

          <Subheading>¿No se puede leer el código?</Subheading>
          <Body muted>Escribe el código de reserva y el puesto que muestra el pasajero.</Body>
          <Field
            label="Código de reserva"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="VTP-7K3QXA"
          />
          <Field
            label="Puesto"
            value={seat}
            onChangeText={setSeat}
            autoCapitalize="characters"
            placeholder="12"
          />
          <Button
            title="Validar"
            variant="secondary"
            loading={busy}
            disabled={!code.trim() || !seat.trim()}
            onPress={() => void validate({ bookingCode: code, seatNumber: seat })}
          />
        </>
      )}
    </Screen>
  );
}

function ResultCard({ result }: { result: TicketValidation }) {
  const verdict = ticketVerdict(result);
  return (
    <>
      <Banner tone={verdict.tone}>
        {verdict.title}
        {verdict.detail ? `\n${verdict.detail}` : ''}
      </Banner>
      <Card>
        <Row>
          <Badge label={`Puesto ${result.seatNumber}`} tone={verdict.ok ? 'success' : 'neutral'} />
          <Badge label={result.bookingCode} />
        </Row>
        <Heading>{result.passengerName}</Heading>
        <Body>{result.documentNumber}</Body>
        <Body muted>
          {result.from.city} → {result.to.city} · sale {localTime(result.departsAt)}
        </Body>
        <Body muted>{result.route.name}</Body>
      </Card>
    </>
  );
}

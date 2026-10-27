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
import { localTime, type TicketValidation, type ValidateTicketRequest } from '@vtp/shared-types';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ticketErrorMessage, ticketVerdict } from '@/lib/ticket-result';

/** The same code read again within this time is ignored (the camera reports it many times). */
const REPEAT_MS = 4000;

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
  const lastScan = useRef<{ data: string; at: number } | null>(null);

  const validate = async (body: ValidateTicketRequest) => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.request<TicketValidation>(`/organizations/${organizationId}/tickets/validate`, {
          method: 'POST',
          body,
        }),
      );
    } catch (e) {
      setResult(null);
      setError(
        e instanceof ApiError ? ticketErrorMessage(e.status, userMessage(e)) : userMessage(e),
      );
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
    setCode('');
    setSeat('');
  };

  const showing = result !== null || error !== null;

  return (
    <Screen>
      {name ? <Body muted>{name}</Body> : null}

      {showing ? (
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
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

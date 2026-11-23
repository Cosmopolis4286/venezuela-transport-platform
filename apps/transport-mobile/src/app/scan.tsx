import { Banner, Body, Button, Card, Field, Screen, Subheading, useColors } from '@vtp/mobile-core';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { OFFLINE_LIST_STALE_MS } from '@/lib/offline-tickets';
import { ResultCard } from '@/lib/result-card';
import { useTicketCheck } from '@/lib/use-ticket-check';

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
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [seat, setSeat] = useState('');
  const lastScan = useRef<{ data: string; at: number } | null>(null);
  // The line's tickets stay on the phone to check them without signal (ADR-049).
  const { validate, reset, result, error, busy, offline, saved, listAt } =
    useTicketCheck(organizationId);
  // Re-checked every minute: a list kept too long may miss tickets sold later.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const stale =
    saved.list !== null && now - Date.parse(saved.list.generatedAt) > OFFLINE_LIST_STALE_MS;

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
    reset();
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

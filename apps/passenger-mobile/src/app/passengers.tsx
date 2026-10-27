import {
  ApiError,
  Banner,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Screen,
  Segmented,
  Subheading,
  useAuth,
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatMoney,
  IDENTITY_DOCUMENT_TYPES,
  type Booking,
  type IdentityDocumentType,
  type PassengerInput,
} from '@vtp/shared-types';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useBookingDraft } from '@/lib/booking-draft';

const DOCUMENT_LABELS: Record<IdentityDocumentType, string> = { V: 'V', E: 'E', P: 'Pasaporte' };

/** Name and ID of each traveller, then the seats are held. */
export default function PassengersScreen() {
  const user = useCurrentUser();
  const { api } = useAuth();
  const { trip, seats, clear } = useBookingDraft();
  const [passengers, setPassengers] = useState<PassengerInput[]>(() =>
    seats.map((seatNumber, index) => ({
      seatNumber,
      firstName: index === 0 ? (user.firstName ?? '') : '',
      lastName: index === 0 ? (user.lastName ?? '') : '',
      documentType: 'V',
      documentNumber: '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!trip || !seats.length) return <Redirect href="/" />;

  const update = (index: number, patch: Partial<PassengerInput>) =>
    setPassengers((current) => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const complete = passengers.every(
    (p) => p.firstName.trim() && p.lastName.trim() && p.documentNumber.trim().length >= 4,
  );

  const hold = async () => {
    setBusy(true);
    setError(null);
    try {
      const booking = await api.request<Booking>('/bookings', {
        body: {
          scheduleId: trip.scheduleId,
          serviceDate: trip.serviceDate,
          fromStopId: trip.from.id,
          toStopId: trip.to.id,
          passengers,
        },
      });
      clear();
      // Back from the booking goes to the results, not to a seat map with stale selections.
      router.dismissTo('/results');
      router.push({ pathname: '/booking/[id]', params: { id: booking.id } });
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        setError(
          /taken/.test(e.apiMessage)
            ? 'Alguien acaba de apartar uno de esos puestos. Vuelve atrás y elige otro.'
            : /pending/.test(e.apiMessage)
              ? 'Tienes reservas sin pagar. Págalas o cancélalas antes de apartar más puestos.'
              : 'Esta salida ya no se puede reservar.',
        );
      } else if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
        setError('Revisa los nombres y números de documento.');
      } else {
        setError(userMessage(e));
      }
    }
  };

  return (
    <Screen>
      <Heading>Pasajeros</Heading>
      <Body muted>Como aparecen en el documento que mostrarán al abordar.</Body>
      {passengers.map((passenger, index) => (
        <Card key={passenger.seatNumber}>
          <Subheading>Puesto {passenger.seatNumber}</Subheading>
          <Field
            label="Nombres"
            value={passenger.firstName}
            onChangeText={(firstName) => update(index, { firstName })}
          />
          <Field
            label="Apellidos"
            value={passenger.lastName}
            onChangeText={(lastName) => update(index, { lastName })}
          />
          <Segmented
            label="Documento"
            options={IDENTITY_DOCUMENT_TYPES.map((value) => ({
              value,
              label: DOCUMENT_LABELS[value],
            }))}
            value={passenger.documentType}
            onChange={(documentType) => update(index, { documentType })}
          />
          <Field
            label={`Número de documento del puesto ${passenger.seatNumber}`}
            value={passenger.documentNumber}
            onChangeText={(documentNumber) => update(index, { documentNumber })}
            keyboardType={passenger.documentType === 'P' ? 'default' : 'number-pad'}
            autoCapitalize="characters"
            maxLength={20}
          />
        </Card>
      ))}
      <Body>
        Total:{' '}
        {formatMoney(
          (Number(trip.fare!.amount) * passengers.length).toFixed(2),
          trip.fare!.currency,
        )}
      </Body>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title="Apartar puestos"
        loading={busy}
        disabled={!complete}
        onPress={() => void hold()}
      />
    </Screen>
  );
}

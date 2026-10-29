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
import { useT } from '@/i18n/use-t';
import { useBookingDraft } from '@/lib/booking-draft';

/** Name and ID of each traveller, then the seats are held. */
export default function PassengersScreen() {
  const user = useCurrentUser();
  const { api } = useAuth();
  const { trip, seats, clear } = useBookingDraft();
  const { t, locale } = useT();
  const documentLabels: Record<IdentityDocumentType, string> = {
    V: 'V',
    E: 'E',
    P: t.passengers.passport,
  };
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
      if (e instanceof ApiError && e.code === 'CONFLICT' && !e.reason) {
        setError(t.passengers.notBookable);
      } else if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
        setError(t.passengers.checkNames);
      } else {
        setError(userMessage(e));
      }
    }
  };

  return (
    <Screen>
      <Heading>{t.passengers.heading}</Heading>
      <Body muted>{t.passengers.intro}</Body>
      {passengers.map((passenger, index) => (
        <Card key={passenger.seatNumber}>
          <Subheading>{t.seat(passenger.seatNumber)}</Subheading>
          <Field
            label={t.passengers.firstNames}
            value={passenger.firstName}
            onChangeText={(firstName) => update(index, { firstName })}
          />
          <Field
            label={t.passengers.lastNames}
            value={passenger.lastName}
            onChangeText={(lastName) => update(index, { lastName })}
          />
          <Segmented
            label={t.passengers.document}
            options={IDENTITY_DOCUMENT_TYPES.map((value) => ({
              value,
              label: documentLabels[value],
            }))}
            value={passenger.documentType}
            onChange={(documentType) => update(index, { documentType })}
          />
          <Field
            label={t.passengers.documentNumberFor(passenger.seatNumber)}
            value={passenger.documentNumber}
            onChangeText={(documentNumber) => update(index, { documentNumber })}
            keyboardType={passenger.documentType === 'P' ? 'default' : 'number-pad'}
            autoCapitalize="characters"
            maxLength={20}
          />
        </Card>
      ))}
      <Body>
        {t.passengers.total}:{' '}
        {formatMoney(
          (Number(trip.fare!.amount) * passengers.length).toFixed(2),
          trip.fare!.currency,
          locale,
        )}
      </Body>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title={t.passengers.hold}
        loading={busy}
        disabled={!complete}
        onPress={() => void hold()}
      />
    </Screen>
  );
}

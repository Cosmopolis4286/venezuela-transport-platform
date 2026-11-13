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
  useApi,
  useAuth,
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import {
  formatMoney,
  IDENTITY_DOCUMENT_TYPES,
  packFits,
  type Booking,
  type TripPack,
  type IdentityDocumentType,
  type PassengerInput,
  withServiceFee,
} from '@vtp/shared-types';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { PriceBreakdown } from '@/components/price-breakdown';
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
  const [contactPhone, setContactPhone] = useState(user.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payWith, setPayWith] = useState<string | null>(null);
  // Trip packs only pay suburban departures of operators that accept them (ADR-035).
  const packs = useApi<TripPack[]>(
    trip?.scope === 'suburban' && trip.acceptsTripPacks ? '/me/trip-packs' : null,
  );
  if (!trip || !seats.length) return <Redirect href="/" />;
  const usable = (packs.data ?? []).filter((pack) => packFits(pack, trip, seats.length));
  // A pack that fits is the default: it is what the passenger bought it for.
  const choice =
    payWith && (payWith === 'money' || usable.some((p) => p.id === payWith))
      ? payWith
      : (usable[0]?.id ?? 'money');
  const pack = usable.find((p) => p.id === choice) ?? null;
  // Paying with money: the fares plus the platform's service fee (ADR-029).
  const total = formatMoney(
    withServiceFee((Number(trip.fare!.amount) * passengers.length).toFixed(2), trip.serviceFeeRate)
      .total,
    trip.fare!.currency,
    locale,
  );

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
          // Open tickets (empty seat) go without a seat: the API numbers them.
          passengers: passengers.map(({ seatNumber, ...rest }) =>
            seatNumber ? { seatNumber, ...rest } : rest,
          ),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...(pack ? { tripPackId: pack.id } : {}),
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
        <Card key={passenger.seatNumber || `open-${index}`}>
          <Subheading>
            {passenger.seatNumber ? t.seat(passenger.seatNumber) : t.passengerN(index + 1)}
          </Subheading>
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
            label={t.passengers.documentNumberFor(passenger.seatNumber || String(index + 1))}
            value={passenger.documentNumber}
            onChangeText={(documentNumber) => update(index, { documentNumber })}
            keyboardType={passenger.documentType === 'P' ? 'default' : 'number-pad'}
            autoCapitalize="characters"
            maxLength={20}
          />
        </Card>
      ))}
      <Field
        label={t.passengers.contactPhone}
        hint={t.passengers.contactHint}
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        maxLength={20}
      />
      {usable.length ? (
        <Segmented
          label={t.passengers.payHow}
          options={[
            ...usable.map((p) => ({
              value: p.id,
              label: t.passengers.payPack(p.code, p.remaining),
            })),
            { value: 'money', label: t.passengers.payMoney(total) },
          ]}
          value={choice}
          onChange={setPayWith}
        />
      ) : null}
      {/* Paid with a pack: no fares and no service fee to show. */}
      {pack ? null : (
        <PriceBreakdown
          label={t.passengers.total}
          fares={(Number(trip.fare!.amount) * passengers.length).toFixed(2)}
          rate={trip.serviceFeeRate}
          currency={trip.fare!.currency}
        />
      )}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title={pack ? t.passengers.bookWithPack : t.passengers.hold}
        loading={busy}
        disabled={!complete}
        onPress={() => void hold()}
      />
    </Screen>
  );
}

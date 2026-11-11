import {
  Banner,
  Body,
  Button,
  Card,
  Field,
  Segmented,
  Subheading,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import { BUYER_ID_TYPES, type Booking, type BuyerIdType } from '@vtp/shared-types';
import { useState } from 'react';
import { useT } from '@/i18n/use-t';

/**
 * The platform's invoice for the service fee (ADR-031): its number once issued, and until then
 * who it will be made out to, with a form to ask for another name (a company, for instance).
 */
export function InvoicePanel({
  booking,
  onChange,
}: {
  booking: Booking;
  onChange: (booking: Booking) => void;
}) {
  const { api } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(booking.billing?.name ?? '');
  const [idType, setIdType] = useState<BuyerIdType>(booking.billing?.idType ?? 'J');
  const [idNumber, setIdNumber] = useState(booking.billing?.idNumber ?? '');
  const [address, setAddress] = useState(booking.billing?.address ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  if (!booking.serviceFee || Number(booking.serviceFee.amount) <= 0) return null;
  const invoice = booking.invoice;
  const editable =
    (booking.status === 'held' || booking.status === 'confirmed') &&
    (!invoice || invoice.status === 'draft');
  if (!editable && !invoice) return null;

  const save = async (billing: Booking['billing']) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api.request<Booking>(`/me/bookings/${booking.id}/billing`, {
        method: 'PUT',
        body: { billing },
      });
      onChange(updated);
      setOpen(false);
      setMessage({ tone: 'success', text: t.invoice.saved });
    } catch (e) {
      setMessage({ tone: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const first = booking.passengers[0];
  const buyerName =
    booking.billing?.name ??
    (first ? `${first.firstName} ${first.lastName}` : t.invoice.firstPassenger);

  return (
    <Card>
      <Subheading>{t.invoice.title}</Subheading>
      {invoice?.status === 'issued' && invoice.number ? (
        <Body>
          {t.invoice.issued(invoice.number, invoice.controlNumber ?? '', invoice.issuedOn ?? '')}
        </Body>
      ) : invoice?.status === 'voided' ? (
        <Body muted>{t.invoice.voided}</Body>
      ) : (
        <Body muted>{t.invoice.pending(buyerName)}</Body>
      )}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {editable && !open ? (
        <Button variant="secondary" title={t.invoice.otherName} onPress={() => setOpen(true)} />
      ) : null}
      {editable && open ? (
        <>
          <Field label={t.invoice.name} value={name} onChangeText={setName} />
          <Segmented
            label={t.invoice.idType}
            options={BUYER_ID_TYPES.map((value) => ({ value, label: value }))}
            value={idType}
            onChange={setIdType}
          />
          <Field
            label={t.invoice.idNumber}
            value={idNumber}
            onChangeText={setIdNumber}
            autoCapitalize="characters"
          />
          <Field label={t.invoice.address} value={address} onChangeText={setAddress} />
          <Button
            title={t.invoice.save}
            loading={busy}
            disabled={!name.trim() || !idNumber.trim()}
            onPress={() =>
              void save({
                name: name.trim(),
                idType,
                idNumber: idNumber.trim(),
                address: address.trim() || null,
              })
            }
          />
        </>
      ) : null}
      {editable && booking.billing ? (
        <Button
          variant="secondary"
          title={t.invoice.useFirst}
          loading={busy}
          onPress={() => void save(null)}
        />
      ) : null}
    </Card>
  );
}

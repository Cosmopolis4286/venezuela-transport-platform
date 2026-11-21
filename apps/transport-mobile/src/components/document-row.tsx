import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_REVIEW_STATUS_LABELS,
  type ApplicationDocument,
  type DocumentKind,
  type DocumentRenewal,
  type ProviderApplication,
} from '@vtp/shared-types';
import {
  ApiError,
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Field,
  Row,
  formatDate,
  statusTone,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import { useState } from 'react';
import { documentForm, pickDocument } from '@/lib/upload';
import { isIsoDate } from '@/lib/validation';

/**
 * One required document: what was uploaded, its review verdict, and upload or replace. Approved
 * drivers renew the ones that expire (`renewable`, ADR-042): the new copy waits for review.
 */
export function DocumentRow({
  kind,
  document,
  editable,
  renewable = false,
  expiry,
  renewal,
  onUploaded,
}: {
  kind: DocumentKind;
  document: ApplicationDocument | undefined;
  editable: boolean;
  renewable?: boolean;
  /** Set when it expires within 30 days or already expired. */
  expiry?: { expired: boolean };
  renewal?: DocumentRenewal;
  onUploaded: (application: ProviderApplication) => void;
}) {
  const { api } = useAuth();
  const [expiresOn, setExpiresOn] = useState(renewable ? '' : (document?.expiresOn ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidDate = expiresOn !== '' && !isIsoDate(expiresOn);

  const upload = async () => {
    setError(null);
    const asset = await pickDocument();
    if (!asset) return;
    setBusy(true);
    try {
      onUploaded(
        await api.request<ProviderApplication>(
          `/me/application/${renewable ? 'renewals' : 'documents'}/${kind}`,
          {
            method: 'PUT',
            form: documentForm(asset, expiresOn || undefined),
          },
        ),
      );
      if (renewable) setExpiresOn('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'VALIDATION_FAILED'
          ? renewable
            ? 'No pudimos aceptar el archivo. Sube una foto (JPG o PNG) o un PDF legible, con la fecha de vencimiento de la copia nueva (futura).'
            : 'No pudimos aceptar el archivo. Sube una foto (JPG o PNG) o un PDF legible; la fecha de vencimiento, si la indicas, debe ser futura.'
          : userMessage(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Body>{DOCUMENT_KIND_LABELS[kind]}</Body>
      {document ? (
        <>
          <Row>
            <Badge
              label={DOCUMENT_REVIEW_STATUS_LABELS[document.status]}
              tone={statusTone(document.status)}
            />
            <Body muted>{document.fileName}</Body>
          </Row>
          {document.expiresOn ? (
            <Body muted>Vence el {formatDate(`${document.expiresOn}T12:00:00Z`)}</Body>
          ) : null}
          {document.rejectionReason ? (
            <Banner tone="error">{document.rejectionReason}</Banner>
          ) : null}
          {expiry && !renewal ? (
            <Banner tone={expiry.expired ? 'error' : 'warning'}>
              {expiry.expired
                ? `Venció. ${kind === 'liability_insurance' ? 'Tu vehículo no puede tomar viajes' : 'No puedes conectarte'} hasta que aprobemos la copia nueva.`
                : 'Vence pronto: sube la copia nueva antes de esa fecha para no dejar de recibir viajes.'}
            </Banner>
          ) : null}
        </>
      ) : (
        <Badge label="Falta" tone="warning" />
      )}
      {renewal?.status === 'pending' ? (
        <Banner tone="info">
          Copia nueva en revisión (vence el {formatDate(`${renewal.expiresOn}T12:00:00Z`)}). Te
          avisamos cuando la aprobemos.
        </Banner>
      ) : null}
      {renewal?.status === 'rejected' ? (
        <Banner tone="error">
          No aprobamos la copia nueva: {renewal.rejectionReason ?? 'no es válida'}. Sube otra.
        </Banner>
      ) : null}
      {renewable ? (
        <>
          <Field
            label="Vencimiento de la copia nueva"
            placeholder="AAAA-MM-DD"
            value={expiresOn}
            onChangeText={setExpiresOn}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={invalidDate ? 'Usa el formato AAAA-MM-DD.' : undefined}
          />
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button
            variant={expiry ? 'primary' : 'secondary'}
            title={
              renewal?.status === 'pending' ? 'Reemplazar la copia nueva' : 'Renovar documento'
            }
            loading={busy}
            disabled={!isIsoDate(expiresOn)}
            onPress={() => void upload()}
          />
        </>
      ) : null}
      {editable ? (
        <>
          <Field
            label="Fecha de vencimiento (opcional)"
            placeholder="AAAA-MM-DD"
            value={expiresOn}
            onChangeText={setExpiresOn}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={invalidDate ? 'Usa el formato AAAA-MM-DD.' : undefined}
          />
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button
            variant={document ? 'secondary' : 'primary'}
            title={document ? 'Reemplazar archivo' : 'Subir foto o PDF'}
            loading={busy}
            disabled={invalidDate}
            onPress={() => void upload()}
          />
        </>
      ) : null}
    </Card>
  );
}

import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_REVIEW_STATUS_LABELS,
  type ApplicationDocument,
  type DocumentKind,
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

/** One required document: what was uploaded, its review verdict, and upload or replace. */
export function DocumentRow({
  kind,
  document,
  editable,
  onUploaded,
}: {
  kind: DocumentKind;
  document: ApplicationDocument | undefined;
  editable: boolean;
  onUploaded: (application: ProviderApplication) => void;
}) {
  const { api } = useAuth();
  const [expiresOn, setExpiresOn] = useState(document?.expiresOn ?? '');
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
        await api.request<ProviderApplication>(`/me/application/documents/${kind}`, {
          method: 'PUT',
          form: documentForm(asset, expiresOn || undefined),
        }),
      );
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'VALIDATION_FAILED'
          ? 'No pudimos aceptar el archivo. Sube una foto (JPG o PNG) o un PDF legible; la fecha de vencimiento, si la indicas, debe ser futura.'
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
        </>
      ) : (
        <Badge label="Falta" tone="warning" />
      )}
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

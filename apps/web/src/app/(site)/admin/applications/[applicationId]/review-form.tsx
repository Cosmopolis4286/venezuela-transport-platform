'use client';

import { DOCUMENT_KIND_LABELS, type ApplicationDocument } from '@vtp/shared-types';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { initialFormState } from '@/lib/form-state';
import { reviewApplication } from '../../actions';

export function ReviewForm({
  applicationId,
  documents,
}: {
  applicationId: string;
  documents: ApplicationDocument[];
}) {
  const [state, action, pending] = useActionState(reviewApplication, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <ul className="flex flex-col divide-y rounded-lg border">
        {documents.map((document) => (
          <li
            key={document.id}
            className="grid gap-2 p-3 sm:grid-cols-[1fr_10rem_1fr] sm:items-center"
          >
            <input type="hidden" name="documentId" value={document.id} />
            <div>
              <a
                href={`/admin/applications/${applicationId}/documents/${document.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {DOCUMENT_KIND_LABELS[document.kind]}
              </a>
              <p className="text-xs text-muted-foreground">
                {document.fileName} · {Math.ceil(document.sizeBytes / 1024)} KB
                {document.expiresOn ? ` · vence ${document.expiresOn}` : ''}
              </p>
            </div>
            <Select
              name={`status:${document.id}`}
              defaultValue={document.status === 'pending' ? '' : document.status}
              aria-label="Veredicto"
            >
              <option value="">Sin revisar</option>
              <option value="accepted">Aceptado</option>
              <option value="rejected">Rechazado</option>
            </Select>
            <Input
              name={`reason:${document.id}`}
              placeholder="Motivo si se rechaza"
              defaultValue={document.rejectionReason ?? ''}
            />
          </li>
        ))}
      </ul>
      <Field
        label="Notas para el solicitante"
        htmlFor="notes"
        hint="Obligatorias al rechazar o pedir cambios."
      >
        <Textarea id="notes" name="notes" maxLength={1000} />
      </Field>
      {state.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          Aprobar
        </Button>
        <Button
          type="submit"
          name="decision"
          value="request_changes"
          variant="outline"
          disabled={pending}
        >
          Pedir cambios
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="destructive"
          disabled={pending}
        >
          Rechazar
        </Button>
      </div>
    </form>
  );
}

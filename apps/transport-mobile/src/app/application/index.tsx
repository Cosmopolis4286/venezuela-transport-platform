import {
  APPLICATION_STATUS_LABELS,
  isRenewableDocument,
  requiredDocuments,
  type ProviderApplication,
} from '@vtp/shared-types';
import {
  ApiError,
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Heading,
  Row,
  Screen,
  Subheading,
  formatDate,
  statusTone,
  useApi,
  useAuth,
  userMessage,
} from '@vtp/mobile-core';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';
import { DocumentRow } from '@/components/document-row';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

const EDITABLE = new Set(['draft', 'changes_requested']);

/** What they drive with VTP (ADR-039); older applications had no vehicle type. */
const MODE_TITLE = { car: 'Conductor de VTP · Carro', motorcycle: 'Conductor de VTP · Moto' };

export default function ApplicationScreen() {
  const { api, reload: reloadUser } = useAuth();
  const resource = useApi<ProviderApplication>('/me/application');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRefreshOnFocus(resource.reload);

  const application = resource.data;

  if (resource.error?.code === 'NOT_FOUND') return <Redirect href="/application/edit" />;
  if (!application) {
    return (
      <Screen>
        {resource.error ? (
          <Banner tone="error">{resource.error.userMessage}</Banner>
        ) : (
          <ActivityIndicator />
        )}
      </Screen>
    );
  }

  const editable = EDITABLE.has(application.status);
  const kinds = requiredDocuments(application.desiredRole, application.providesVehicle);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      resource.mutate(
        await api.request<ProviderApplication>('/me/application/submit', { method: 'POST' }),
      );
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'VALIDATION_FAILED'
          ? 'Antes de enviarla, reemplaza los documentos rechazados o vencidos.'
          : userMessage(e),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={resource.loading}
          onRefresh={() => {
            void resource.reload();
            void reloadUser().catch(() => undefined);
          }}
        />
      }
    >
      <Row>
        <Heading>{application.mode ? MODE_TITLE[application.mode] : 'Conductor de VTP'}</Heading>
        <Badge
          label={APPLICATION_STATUS_LABELS[application.status]}
          tone={statusTone(application.status)}
        />
      </Row>
      <StatusExplanation application={application} />
      {application.expiring.some((e) => e.expired) ? (
        <Banner tone="error">
          Tienes documentos vencidos. Renuévalos abajo: hasta que aprobemos las copias nuevas no
          puedes recibir viajes.
        </Banner>
      ) : application.expiring.length ? (
        <Banner tone="warning">
          Tienes documentos por vencer. Renuévalos abajo con tiempo para no dejar de recibir viajes.
        </Banner>
      ) : null}

      <Card>
        <Subheading>Tus datos</Subheading>
        <Body>
          {application.firstName} {application.lastName}
        </Body>
        <Body muted>
          {application.documentType}-{application.documentNumber} · nacido el{' '}
          {formatDate(`${application.birthDate}T12:00:00Z`)}
        </Body>
        {application.city || application.state ? (
          <Body muted>{[application.city, application.state].filter(Boolean).join(', ')}</Body>
        ) : null}
        {application.vehicle ? (
          <Body muted>
            Vehículo: {application.vehicle.make} {application.vehicle.model}{' '}
            {application.vehicle.year} · {application.vehicle.color} · {application.vehicle.plate}
          </Body>
        ) : null}
        {editable ? (
          <Button
            variant="secondary"
            title="Editar datos"
            onPress={() => router.push('/application/edit')}
          />
        ) : null}
      </Card>

      <Subheading>Documentos</Subheading>
      {editable ? (
        <Body muted>Sube una foto clara o un PDF (máximo 10 MB) de cada documento.</Body>
      ) : null}
      {kinds.map((kind) => (
        <DocumentRow
          key={`${kind}-${application.documents.find((d) => d.kind === kind)?.id ?? 'none'}`}
          kind={kind}
          document={application.documents.find((d) => d.kind === kind)}
          editable={editable}
          // Approved drivers keep their papers current (ADR-042).
          renewable={application.status === 'approved' && isRenewableDocument(kind)}
          expiry={application.expiring.find((e) => e.kind === kind)}
          renewal={application.renewals.find((r) => r.kind === kind)}
          onUploaded={resource.mutate}
        />
      ))}

      {editable ? (
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {application.missingDocuments.length ? (
            <Body muted>
              Faltan {application.missingDocuments.length} documento(s) para poder enviarla.
            </Body>
          ) : null}
          <Button
            title="Enviar a revisión"
            loading={submitting}
            disabled={application.missingDocuments.length > 0}
            onPress={() => void submit()}
          />
        </>
      ) : null}
    </Screen>
  );
}

function StatusExplanation({ application }: { application: ProviderApplication }) {
  switch (application.status) {
    case 'draft':
      return <Banner tone="info">Completa tus documentos y envía la solicitud a revisión.</Banner>;
    case 'submitted':
      return (
        <Banner tone="warning">
          Enviada el {formatDate(application.submittedAt ?? application.createdAt)}. El equipo de la
          plataforma está revisando tus documentos.
        </Banner>
      );
    case 'changes_requested':
      return (
        <Banner tone="warning">
          Debes corregir algo antes de volver a enviarla
          {application.reviewNotes ? `: ${application.reviewNotes}` : '.'}
        </Banner>
      );
    case 'approved':
      return (
        <Banner tone="success">
          ¡Bienvenido a VTP! Tus documentos fueron verificados: ya puedes recibir viajes desde el
          inicio, en Solicitudes de {application.mode === 'motorcycle' ? 'moto' : 'taxi'}.
        </Banner>
      );
    case 'rejected':
      return (
        <Banner tone="error">
          La solicitud fue rechazada{application.reviewNotes ? `: ${application.reviewNotes}` : '.'}
        </Banner>
      );
  }
}

import {
  APPLICATION_STATUS_LABELS,
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  type DriverTrip,
  type OrganizationMembershipSummary,
  type ProviderApplication,
  type ReceivedInvitation,
} from '@vtp/shared-types';
import {
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
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { tripLoad, tripWhen } from '@/lib/driver-trip';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

export default function Home() {
  const user = useCurrentUser();
  const { api, signOut } = useAuth();
  const organizations = useApi<OrganizationMembershipSummary[]>('/me/organizations');
  const invitations = useApi<ReceivedInvitation[]>('/me/invitations');
  const application = useApi<ProviderApplication>('/me/application');
  const drives = organizations.data?.some((m) => m.permissions.includes('trips.drive')) ?? false;
  const driving = useApi<DriverTrip[]>(drives ? '/me/driving' : null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { reload: reloadOrganizations } = organizations;
  const { reload: reloadInvitations } = invitations;
  const { reload: reloadApplication } = application;
  const { reload: reloadDriving } = driving;
  const reloadAll = useCallback(async () => {
    await Promise.all([
      reloadOrganizations(),
      reloadInvitations(),
      reloadApplication(),
      reloadDriving(),
    ]);
  }, [reloadOrganizations, reloadInvitations, reloadApplication, reloadDriving]);
  useRefreshOnFocus(reloadAll);

  const respond = async (invitation: ReceivedInvitation, answer: 'accept' | 'decline') => {
    setBusyId(invitation.id);
    setMessage(null);
    try {
      await api.request(`/me/invitations/${invitation.id}/${answer}`, { method: 'POST' });
      const name = invitation.organization.tradeName ?? invitation.organization.legalName;
      setMessage({
        tone: 'success',
        text:
          answer === 'accept'
            ? `Ahora eres ${ORGANIZATION_ROLE_LABELS[invitation.role].toLowerCase()} en ${name}.`
            : `Rechazaste la invitación de ${name}.`,
      });
      await Promise.all([reloadOrganizations(), reloadInvitations()]);
    } catch (error) {
      setMessage({ tone: 'error', text: userMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const noApplication = application.error?.code === 'NOT_FOUND';
  const refreshing =
    organizations.loading || invitations.loading || application.loading || driving.loading;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reloadAll()} />}
    >
      <Heading>{user.firstName ? `Hola, ${user.firstName}` : 'Hola'}</Heading>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      {invitations.data?.length ? (
        <>
          <Subheading>Invitaciones</Subheading>
          {invitations.data.map((invitation) => (
            <Card key={invitation.id}>
              <Body>
                {invitation.organization.tradeName ?? invitation.organization.legalName} te invita
                como {ORGANIZATION_ROLE_LABELS[invitation.role].toLowerCase()}.
              </Body>
              <Body muted>
                {ORGANIZATION_TYPE_LABELS[invitation.organization.type]} · vence el{' '}
                {formatDate(invitation.expiresAt)}
              </Body>
              <Row>
                <Button
                  title="Aceptar"
                  loading={busyId === invitation.id}
                  disabled={busyId !== null}
                  onPress={() => void respond(invitation, 'accept')}
                />
                <Button
                  variant="secondary"
                  title="Rechazar"
                  disabled={busyId !== null}
                  onPress={() => void respond(invitation, 'decline')}
                />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {drives ? (
        <>
          <Subheading>Mis viajes</Subheading>
          {driving.error ? (
            <Banner tone="error">{driving.error.userMessage}</Banner>
          ) : driving.data?.length ? (
            driving.data.map((trip) => (
              <Card key={trip.id}>
                <Body>{trip.route.name}</Body>
                <Body muted>{tripWhen(trip)}</Body>
                <Body muted>{tripLoad(trip)}</Body>
                <Button
                  variant="secondary"
                  title="Ver pasajeros"
                  onPress={() =>
                    router.push({ pathname: '/trip/[tripId]', params: { tripId: trip.id } })
                  }
                />
              </Card>
            ))
          ) : driving.data ? (
            <Body muted>
              No tienes viajes asignados. Tu despachador te los asigna en el portal.
            </Body>
          ) : null}
        </>
      ) : null}

      <Subheading>Mis organizaciones</Subheading>
      {organizations.error ? (
        <Banner tone="error">{organizations.error.userMessage}</Banner>
      ) : organizations.data?.length ? (
        organizations.data.map(({ organization, role, permissions }) => (
          <Card key={organization.id}>
            <Body>{organization.tradeName ?? organization.legalName}</Body>
            <Body muted>{ORGANIZATION_TYPE_LABELS[organization.type]}</Body>
            <Row>
              <Badge label={ORGANIZATION_ROLE_LABELS[role]} />
              <Badge
                label={ORGANIZATION_STATUS_LABELS[organization.status]}
                tone={statusTone(organization.status)}
              />
            </Row>
            {organization.status === 'active' && permissions.includes('tickets.validate') ? (
              <Button
                title="Validar boletos"
                onPress={() =>
                  router.push({
                    pathname: '/scan',
                    params: {
                      organizationId: organization.id,
                      name: organization.tradeName ?? organization.legalName,
                    },
                  })
                }
              />
            ) : null}
          </Card>
        ))
      ) : organizations.data ? (
        <Body muted>
          Aún no perteneces a ninguna. Acepta la invitación de tu empresa o envía una solicitud.
        </Body>
      ) : null}

      <Subheading>Solicitud para trabajar</Subheading>
      {application.data ? (
        <Card>
          <Row>
            <Body>{ORGANIZATION_ROLE_LABELS[application.data.desiredRole]}</Body>
            <Badge
              label={APPLICATION_STATUS_LABELS[application.data.status]}
              tone={statusTone(application.data.status)}
            />
          </Row>
          {application.data.organization ? (
            <Body muted>{application.data.organization.legalName}</Body>
          ) : null}
          <Button
            variant="secondary"
            title="Ver mi solicitud"
            onPress={() => router.push('/application')}
          />
        </Card>
      ) : noApplication ? (
        <Card>
          <Body>
            ¿Quieres trabajar como conductor, despachador, taquillero o inspector? Envía tus datos y
            documentos; el equipo de la plataforma los verifica.
          </Body>
          <Button title="Empezar solicitud" onPress={() => router.push('/application/edit')} />
        </Card>
      ) : application.error ? (
        <Banner tone="error">{application.error.userMessage}</Banner>
      ) : null}

      <Button variant="secondary" title="Cerrar sesión" onPress={() => void signOut()} />
    </Screen>
  );
}

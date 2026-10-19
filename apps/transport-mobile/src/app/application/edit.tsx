import {
  APPLICATION_ROLES,
  IDENTITY_DOCUMENT_TYPES,
  ORGANIZATION_ROLE_LABELS,
  type ApplicationInput,
  type ApplicationRole,
  type IdentityDocumentType,
  type ProviderApplication,
} from '@vtp/shared-types';
import {
  Banner,
  Body,
  Button,
  Field,
  Screen,
  Segmented,
  Subheading,
  useApi,
  useAuth,
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { OrganizationPicker } from '@/components/organization-picker';
import { isIsoDate } from '@/lib/validation';

const DOCUMENT_TYPE_LABELS: Record<IdentityDocumentType, string> = {
  V: 'Cédula V',
  E: 'Cédula E',
  P: 'Pasaporte',
};

export default function EditApplication() {
  const resource = useApi<ProviderApplication>('/me/application');
  const isNew = resource.error?.code === 'NOT_FOUND';
  if (resource.loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (resource.error && !isNew) {
    return (
      <Screen>
        <Banner tone="error">{resource.error.userMessage}</Banner>
      </Screen>
    );
  }
  return <ApplicationForm existing={resource.data ?? null} />;
}

function ApplicationForm({ existing }: { existing: ProviderApplication | null }) {
  const user = useCurrentUser();
  const { api } = useAuth();
  const [role, setRole] = useState<ApplicationRole>(existing?.desiredRole ?? 'driver');
  const [organization, setOrganization] = useState(existing?.organization ?? null);
  const [form, setForm] = useState({
    firstName: existing?.firstName ?? user.firstName ?? '',
    lastName: existing?.lastName ?? user.lastName ?? '',
    documentNumber: existing?.documentNumber ?? '',
    birthDate: existing?.birthDate ?? '',
    state: existing?.state ?? '',
    city: existing?.city ?? '',
    plate: existing?.vehicle?.plate ?? '',
    make: existing?.vehicle?.make ?? '',
    model: existing?.vehicle?.model ?? '',
    year: existing?.vehicle ? String(existing.vehicle.year) : '',
    color: existing?.vehicle?.color ?? '',
  });
  const [documentType, setDocumentType] = useState<IdentityDocumentType>(
    existing?.documentType ?? 'V',
  );
  const [providesVehicle, setProvidesVehicle] = useState(existing?.providesVehicle ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const withVehicle = role === 'driver' && providesVehicle;
  const badBirthDate = form.birthDate !== '' && !isIsoDate(form.birthDate);
  const complete =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.documentNumber.trim() &&
    isIsoDate(form.birthDate) &&
    (!withVehicle ||
      (form.plate.trim() &&
        form.make.trim() &&
        form.model.trim() &&
        /^\d{4}$/.test(form.year) &&
        form.color.trim()));

  const save = async () => {
    setBusy(true);
    setError(null);
    const input: ApplicationInput = {
      desiredRole: role,
      organizationId: organization?.id ?? null,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      documentType,
      documentNumber: form.documentNumber.trim(),
      birthDate: form.birthDate,
      state: form.state.trim() || undefined,
      city: form.city.trim() || undefined,
      providesVehicle: withVehicle,
      vehicle: withVehicle
        ? {
            plate: form.plate.trim(),
            make: form.make.trim(),
            model: form.model.trim(),
            year: Number(form.year),
            color: form.color.trim(),
          }
        : null,
    };
    try {
      await api.request<ProviderApplication>('/me/application', {
        method: existing ? 'PATCH' : 'POST',
        body: input,
      });
      if (existing) router.back();
      else router.replace('/application');
    } catch (e) {
      setError(userMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Segmented
        label="Quiero trabajar como"
        options={APPLICATION_ROLES.map((value) => ({
          value,
          label: ORGANIZATION_ROLE_LABELS[value],
        }))}
        value={role}
        onChange={(next) => {
          setRole(next);
          setOrganization(null);
        }}
      />
      <OrganizationPicker role={role} selected={organization} onSelect={setOrganization} />

      <Subheading>Datos personales</Subheading>
      <Body muted>Tal como aparecen en tu documento de identidad.</Body>
      <Field label="Nombres" value={form.firstName} onChangeText={set('firstName')} />
      <Field label="Apellidos" value={form.lastName} onChangeText={set('lastName')} />
      <Segmented
        label="Documento"
        options={IDENTITY_DOCUMENT_TYPES.map((value) => ({
          value,
          label: DOCUMENT_TYPE_LABELS[value],
        }))}
        value={documentType}
        onChange={setDocumentType}
      />
      <Field
        label="Número de documento"
        value={form.documentNumber}
        onChangeText={set('documentNumber')}
        keyboardType={documentType === 'P' ? 'default' : 'number-pad'}
        autoCapitalize="characters"
        maxLength={20}
      />
      <Field
        label="Fecha de nacimiento"
        placeholder="AAAA-MM-DD"
        value={form.birthDate}
        onChangeText={set('birthDate')}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={badBirthDate ? 'Usa el formato AAAA-MM-DD, por ejemplo 1990-04-21.' : undefined}
      />
      <Field label="Estado (opcional)" value={form.state} onChangeText={set('state')} />
      <Field label="Ciudad (opcional)" value={form.city} onChangeText={set('city')} />

      {role === 'driver' ? (
        <>
          <Segmented
            label="¿Trabajas con vehículo propio?"
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Sí (por ejemplo, taxi)' },
            ]}
            value={providesVehicle ? 'yes' : 'no'}
            onChange={(value) => setProvidesVehicle(value === 'yes')}
          />
          {providesVehicle ? (
            <>
              <Subheading>Vehículo</Subheading>
              <Field
                label="Placa"
                value={form.plate}
                onChangeText={set('plate')}
                autoCapitalize="characters"
                maxLength={10}
              />
              <Field label="Marca" value={form.make} onChangeText={set('make')} />
              <Field label="Modelo" value={form.model} onChangeText={set('model')} />
              <Field
                label="Año"
                value={form.year}
                onChangeText={set('year')}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Field label="Color" value={form.color} onChangeText={set('color')} />
            </>
          ) : null}
        </>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title={existing ? 'Guardar cambios' : 'Continuar a los documentos'}
        loading={busy}
        disabled={!complete}
        onPress={() => void save()}
      />
    </Screen>
  );
}

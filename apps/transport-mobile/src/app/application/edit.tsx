import {
  IDENTITY_DOCUMENT_TYPES,
  LEGAL_PAGES,
  type ApplicationInput,
  type IdentityDocumentType,
  type OnDemandMode,
  type ProviderApplication,
} from '@vtp/shared-types';
import {
  Banner,
  Body,
  Button,
  Field,
  openLegalPage,
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

/**
 * "Drive with VTP" (ADR-039): an independent driver with their own car or motorcycle. No role or
 * company to pick: staff of a company or line join by its invitation, not here.
 */
function ApplicationForm({ existing }: { existing: ProviderApplication | null }) {
  const user = useCurrentUser();
  const { api } = useAuth();
  const [mode, setMode] = useState<OnDemandMode>(existing?.mode ?? 'car');
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const badBirthDate = form.birthDate !== '' && !isIsoDate(form.birthDate);
  const complete =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.documentNumber.trim() &&
    isIsoDate(form.birthDate) &&
    form.plate.trim() &&
    form.make.trim() &&
    form.model.trim() &&
    /^\d{4}$/.test(form.year) &&
    form.color.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    const input: ApplicationInput = {
      mode,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      documentType,
      documentNumber: form.documentNumber.trim(),
      birthDate: form.birthDate,
      state: form.state.trim() || undefined,
      city: form.city.trim() || undefined,
      vehicle: {
        plate: form.plate.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        color: form.color.trim(),
      },
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
      <Subheading>Conduce con VTP</Subheading>
      <Body muted>
        Trabaja por tu cuenta, con tu carro o tu moto, cuando quieras. Revisamos tus documentos y,
        al aprobarlos, empiezas a recibir viajes. ¿Trabajas con una línea o empresa? Pídele que te
        invite: no necesitas esta solicitud.
      </Body>
      <Segmented
        label="¿Con qué vas a trabajar?"
        options={[
          { value: 'car', label: 'Carro (taxi)' },
          { value: 'motorcycle', label: 'Moto (mototaxi)' },
        ]}
        value={mode}
        onChange={setMode}
      />

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

      <Subheading>{mode === 'motorcycle' ? 'Tu moto' : 'Tu carro'}</Subheading>
      <Body muted>
        Solo tú podrás usarlo en VTP. Luego subirás su carnet de circulación y su póliza RCV.
      </Body>
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

      <Body muted>
        Al continuar aceptas las Condiciones para Conductores Independientes: VTP conecta tus viajes
        con los pasajeros; no es tu empleador.
      </Body>
      <Button
        variant="link"
        title="Leer las Condiciones para Conductores Independientes"
        onPress={() => openLegalPage(LEGAL_PAGES.drivers, 'es')}
      />

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

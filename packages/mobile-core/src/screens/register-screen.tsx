import { useState } from 'react';
import { ApiError, userMessage } from '../api/errors';
import { useAuth } from '../auth/auth-context';
import { Banner, Body, Button, Field, Heading, Screen } from '../ui/components';

const PASSWORD_MIN = 10;

export function RegisterScreen({ onSignIn }: { onSignIn: () => void }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const tooShort = form.password.length > 0 && form.password.length < PASSWORD_MIN;
  const complete =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.password.length >= PASSWORD_MIN;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'CONFLICT'
          ? 'Ya existe una cuenta con ese correo. Inicia sesión.'
          : userMessage(e),
      );
      setBusy(false);
    }
  };

  return (
    <Screen safeTop>
      <Heading>Crear cuenta</Heading>
      <Body muted>
        También puedes entrar sin contraseña con un código por SMS, WhatsApp o correo.
      </Body>
      <Field
        label="Nombre"
        value={form.firstName}
        onChangeText={set('firstName')}
        autoComplete="given-name"
      />
      <Field
        label="Apellido"
        value={form.lastName}
        onChangeText={set('lastName')}
        autoComplete="family-name"
      />
      <Field
        label="Correo electrónico"
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
      />
      <Field
        label="Contraseña"
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={`Al menos ${PASSWORD_MIN} caracteres.`}
        error={tooShort ? `Al menos ${PASSWORD_MIN} caracteres.` : undefined}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title="Crear cuenta" onPress={submit} loading={busy} disabled={!complete} />
      <Button variant="link" title="Ya tengo cuenta" onPress={onSignIn} />
    </Screen>
  );
}

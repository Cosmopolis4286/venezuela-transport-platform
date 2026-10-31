import { useState } from 'react';
import { ApiError, userMessage } from '../api/errors';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { Banner, Body, Button, Field, Heading, Screen } from '../ui/components';

const PASSWORD_MIN = 10;

export function RegisterScreen({ onSignIn }: { onSignIn: () => void }) {
  const { register } = useAuth();
  const t = useI18n().core.register;
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
      setError(e instanceof ApiError && e.code === 'CONFLICT' ? t.emailTaken : userMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen safeTop>
      <Heading>{t.title}</Heading>
      <Body muted>{t.intro}</Body>
      <Field
        label={t.firstName}
        value={form.firstName}
        onChangeText={set('firstName')}
        autoComplete="given-name"
      />
      <Field
        label={t.lastName}
        value={form.lastName}
        onChangeText={set('lastName')}
        autoComplete="family-name"
      />
      <Field
        label={t.emailAddress}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
      />
      <Field
        label={t.password}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t.atLeast(PASSWORD_MIN)}
        error={tooShort ? t.atLeast(PASSWORD_MIN) : undefined}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title={t.submit} onPress={submit} loading={busy} disabled={!complete} />
      <Button variant="link" title={t.haveAccount} onPress={onSignIn} />
    </Screen>
  );
}

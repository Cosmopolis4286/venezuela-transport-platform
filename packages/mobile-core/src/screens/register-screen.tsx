import { useState } from 'react';
import { ApiError, userMessage } from '../api/errors';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { LegalLinks } from '../legal/legal-links';
import { Banner, Body, Button, Field, Heading, Screen } from '../ui/components';
import { Pressable, View } from 'react-native';
import { useColors } from '../ui/theme';

const PASSWORD_MIN = 10;

export function RegisterScreen({ onSignIn }: { onSignIn: () => void }) {
  const { register } = useAuth();
  const t = useI18n().core.register;
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [accepted, setAccepted] = useState(false);
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const tooShort = form.password.length > 0 && form.password.length < PASSWORD_MIN;
  const complete =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.password.length >= PASSWORD_MIN &&
    accepted;

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
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          onPress={() => setAccepted((a) => !a)}
          style={{
            width: 22,
            height: 22,
            marginTop: 1,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: colors.text,
            backgroundColor: accepted ? colors.text : 'transparent',
          }}
        />
        <View style={{ flex: 1 }}>
          <LegalLinks prefix="accept" />
        </View>
      </View>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title={t.submit} onPress={submit} loading={busy} disabled={!complete} />
      <Button variant="link" title={t.haveAccount} onPress={onSignIn} />
    </Screen>
  );
}

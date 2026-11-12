import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  DeleteAccount,
  Field,
  Heading,
  LanguagePicker,
  SupportButton,
  Row,
  Screen,
  Subheading,
  TermsPrompt,
  useAuth,
  useCurrentUser,
  userMessage,
} from '@vtp/mobile-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { useT } from '@/i18n/use-t';

export default function Account() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  if (user.guest) return <GuestAccount />;

  return (
    <Screen>
      <Heading>{t.account.hello(name ? user.firstName : null)}</Heading>
      <TermsPrompt />
      <Card>
        <Subheading>{t.account.yourAccount}</Subheading>
        {name ? <Body>{name}</Body> : null}
        {user.email ? (
          <Row>
            <Body>{user.email}</Body>
            <Badge
              label={user.emailVerified ? t.account.verified : t.account.unverified}
              tone={user.emailVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
        {user.phone ? (
          <Row>
            <Body>{user.phone}</Body>
            <Badge
              label={user.phoneVerified ? t.account.verified : t.account.unverified}
              tone={user.phoneVerified ? 'success' : 'warning'}
            />
          </Row>
        ) : null}
      </Card>
      <Button title={t.account.myTrips} onPress={() => router.push('/bookings')} />
      <Button
        variant="secondary"
        title={t.account.signOut}
        loading={leaving}
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
      />
      <SupportButton />
      <LanguagePicker />
      <DeleteAccount />
    </Screen>
  );
}

/**
 * A guest (bought without registering, ADR-034): its trips are on this phone. Creating the
 * account keeps them; signing in to an existing one moves them there.
 */
function GuestAccount() {
  const { upgradeGuest } = useAuth();
  const { t } = useT();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const ready = firstName.trim() && lastName.trim() && email.includes('@') && password.length >= 10;

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await upgradeGuest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      setMessage({ tone: 'success', text: t.account.created });
    } catch (e) {
      setMessage({ tone: 'error', text: userMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading>{t.account.guestTitle}</Heading>
      <Body>{t.account.guestIntro}</Body>
      <Button title={t.account.myTrips} onPress={() => router.push('/bookings')} />
      <Card>
        <Subheading>{t.account.createAccount}</Subheading>
        <Field label={t.account.firstName} value={firstName} onChangeText={setFirstName} />
        <Field label={t.account.lastName} value={lastName} onChangeText={setLastName} />
        <Field
          label={t.account.email}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label={t.account.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        <Button
          title={t.account.createAccount}
          loading={busy}
          disabled={!ready}
          onPress={() => void create()}
        />
      </Card>
      <Button
        variant="secondary"
        title={t.account.haveAccount}
        onPress={() => router.push('/sign-in')}
      />
      <SupportButton />
      <LanguagePicker />
    </Screen>
  );
}

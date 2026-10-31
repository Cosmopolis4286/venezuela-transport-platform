import type { OtpChallengeResponse, OtpChannel } from '@vtp/shared-types';
import { useEffect, useState } from 'react';
import { userMessage } from '../api/errors';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { Banner, Body, Button, Field, Heading, Screen, Segmented } from '../ui/components';

type Mode = 'code' | 'password';

/** Seconds left until `iso`, ticking every second (0 once reached). */
function useSecondsUntil(iso: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0;
}

/**
 * Sign in with a one-time code (creates the account on first use) or with e-mail and password.
 * Navigation happens through the auth state, so this screen has no router dependency.
 */
export function SignInScreen({
  title,
  subtitle,
  onRegister,
}: {
  title: string;
  subtitle: string;
  onRegister: () => void;
}) {
  const { state } = useAuth();
  const { core } = useI18n();
  const t = core.signIn;
  const [mode, setMode] = useState<Mode>('code');
  const notice = state.status === 'signedOut' ? state.notice : undefined;

  return (
    <Screen safeTop>
      <Heading>{title}</Heading>
      <Body muted>{subtitle}</Body>
      {notice ? <Banner tone="warning">{notice}</Banner> : null}
      <Segmented
        options={[
          { value: 'code', label: t.withCode },
          { value: 'password', label: t.withPassword },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'code' ? <CodeSignIn /> : <PasswordSignIn />}
      <Button variant="link" title={t.noAccount} onPress={onRegister} />
    </Screen>
  );
}

function CodeSignIn() {
  const { requestCode, verifyCode } = useAuth();
  const t = useI18n().core.signIn;
  const channels: { value: OtpChannel; label: string }[] = [
    { value: 'sms', label: 'SMS' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: t.email },
  ];
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [destination, setDestination] = useState('');
  const [challenge, setChallenge] = useState<OtpChallengeResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendIn = useSecondsUntil(challenge?.resendAvailableAt);
  const isEmail = channel === 'email';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      setChallenge(await requestCode(channel, destination.trim()));
      setCode('');
    });

  if (!challenge) {
    return (
      <>
        <Segmented
          label={t.receiveCodeBy}
          options={channels}
          value={channel}
          onChange={setChannel}
        />
        <Field
          label={isEmail ? t.emailAddress : t.phoneNumber}
          hint={isEmail ? undefined : t.phoneHint}
          value={destination}
          onChangeText={setDestination}
          keyboardType={isEmail ? 'email-address' : 'phone-pad'}
          autoCapitalize="none"
          autoComplete={isEmail ? 'email' : 'tel'}
          textContentType={isEmail ? 'emailAddress' : 'telephoneNumber'}
          onSubmitEditing={send}
        />
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button title={t.sendCode} onPress={send} loading={busy} disabled={!destination.trim()} />
      </>
    );
  }

  const verify = () => run(() => verifyCode(challenge.challengeId, code));
  return (
    <>
      <Body>{t.codeSentTo(challenge.destinationHint)}</Body>
      <Field
        label={t.code}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        onSubmitEditing={verify}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title={t.enter} onPress={verify} loading={busy} disabled={code.length !== 6} />
      <Button
        variant="secondary"
        title={resendIn > 0 ? t.resendIn(resendIn) : t.resend}
        onPress={send}
        disabled={busy || resendIn > 0}
      />
      <Button variant="link" title={t.useAnother} onPress={() => setChallenge(null)} />
    </>
  );
}

function PasswordSignIn() {
  const { signInWithPassword } = useAuth();
  const t = useI18n().core.signIn;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (e) {
      setError(userMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Field
        label={t.emailAddress}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
      />
      <Field
        label={t.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title={t.enter}
        onPress={submit}
        loading={busy}
        disabled={!email.trim() || !password}
      />
    </>
  );
}

import { LEGAL_PAGES, LEGAL_VERSION, localeSegment, type LegalPage } from '@vtp/shared-types';
import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { userMessage } from '../api/errors';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { Banner, Body, Button, Card, Subheading } from '../ui/components';
import { useColors } from '../ui/theme';

/** Public website (`EXPO_PUBLIC_WEB_URL`), where the legal documents are published. */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/** Opens a legal document on the website, in the app's language. */
export function openLegalPage(page: LegalPage, locale: Parameters<typeof localeSegment>[0]) {
  void Linking.openURL(`${WEB_URL}/${localeSegment(locale)}/legal/${page}`);
}

/** "I accept the Terms and Conditions and the Privacy Policy." with tappable links. */
export function LegalLinks({ prefix }: { prefix: 'accept' | 'continue' }) {
  const { core, locale } = useI18n();
  const colors = useColors();
  const t = core.legal;
  const link = (page: LegalPage, label: string) => (
    <Text
      accessibilityRole="link"
      onPress={() => openLegalPage(page, locale)}
      style={{ color: colors.text, textDecorationLine: 'underline' }}
    >
      {label}
    </Text>
  );
  return (
    <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
      {prefix === 'accept' ? t.acceptPrefix : t.continuePrefix} {link(LEGAL_PAGES.terms, t.terms)}{' '}
      {t.and} {link(LEGAL_PAGES.privacy, t.privacy)}.
    </Text>
  );
}

/** Asks a signed-in person to accept a new version of the Terms and Privacy Policy. */
export function TermsPrompt() {
  const { state, acceptTerms } = useAuth();
  const t = useI18n().core.legal;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'signedIn' || state.user.termsVersion === LEGAL_VERSION) return null;
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Body>{t.newVersion}</Body>
      <LegalLinks prefix="continue" />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title={t.accept} onPress={() => void accept()} loading={busy} />
    </Card>
  );
}

/** "Delete my account", with a confirmation step. */
export function DeleteAccount() {
  const { deleteAccount } = useAuth();
  const t = useI18n().core.legal;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return <Button variant="link" title={t.deleteTitle} onPress={() => setConfirming(true)} />;
  }
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (e) {
      setError(userMessage(e));
      setBusy(false);
    }
  };
  return (
    <Card>
      <Subheading>{t.deleteTitle}</Subheading>
      <Body muted>{t.deleteIntro}</Body>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button title={t.deleteConfirm} onPress={() => void run()} loading={busy} />
      <Button variant="secondary" title={t.deleteKeep} onPress={() => setConfirming(false)} />
    </Card>
  );
}

import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { Banner, Button, Centered } from '../ui/components';
import { useColors } from '../ui/theme';

/**
 * Shown while the saved session loads, or when the API cannot be reached to load it; `children`
 * (e.g. a way to the tickets saved on the phone) go under the retry button in that case.
 */
export function SplashScreen({ children }: { children?: ReactNode }) {
  const { state, reload, signOut } = useAuth();
  const colors = useColors();
  const t = useI18n().core.splash;
  if (state.status !== 'unavailable') {
    return (
      <Centered>
        <ActivityIndicator color={colors.text} />
      </Centered>
    );
  }
  return (
    <Centered>
      <Banner tone="error">{state.message}</Banner>
      <Button title={t.retry} onPress={() => void reload()} />
      {children}
      <Button variant="link" title={t.signOut} onPress={() => void signOut()} />
    </Centered>
  );
}

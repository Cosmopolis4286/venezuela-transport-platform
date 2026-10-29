import { ActivityIndicator } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { useI18n } from '../i18n/i18n-context';
import { Banner, Button, Centered } from '../ui/components';
import { useColors } from '../ui/theme';

/** Shown while the saved session loads, or when the API cannot be reached to load it. */
export function SplashScreen() {
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
      <Button variant="link" title={t.signOut} onPress={() => void signOut()} />
    </Centered>
  );
}

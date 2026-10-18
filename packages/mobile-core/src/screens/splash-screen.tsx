import { ActivityIndicator } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { Banner, Button, Centered } from '../ui/components';
import { useColors } from '../ui/theme';

/** Shown while the saved session loads, or when the API cannot be reached to load it. */
export function SplashScreen() {
  const { state, reload, signOut } = useAuth();
  const colors = useColors();
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
      <Button title="Reintentar" onPress={() => void reload()} />
      <Button variant="link" title="Cerrar sesión" onPress={() => void signOut()} />
    </Centered>
  );
}

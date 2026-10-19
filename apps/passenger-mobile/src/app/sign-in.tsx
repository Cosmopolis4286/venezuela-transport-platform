import { SignInScreen } from '@vtp/mobile-core';
import { router } from 'expo-router';

export default function SignIn() {
  return (
    <SignInScreen
      title="VTP Pasajeros"
      subtitle="Entra para buscar y reservar tus viajes en autobús y taxi."
      onRegister={() => router.push('/register')}
    />
  );
}

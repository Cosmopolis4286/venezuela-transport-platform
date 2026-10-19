import { SignInScreen } from '@vtp/mobile-core';
import { router } from 'expo-router';

export default function SignIn() {
  return (
    <SignInScreen
      title="VTP Transportistas"
      subtitle="Para conductores y personal de empresas de autobuses, líneas de taxis y terminales."
      onRegister={() => router.push('/register')}
    />
  );
}

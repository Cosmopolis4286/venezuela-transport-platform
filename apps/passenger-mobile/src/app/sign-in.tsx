import { SignInScreen } from '@vtp/mobile-core';
import { router } from 'expo-router';
import { useT } from '@/i18n/use-t';

export default function SignIn() {
  const { t } = useT();
  return (
    <SignInScreen
      title={t.signIn.title}
      subtitle={t.signIn.subtitle}
      onRegister={() => router.push('/register')}
    />
  );
}

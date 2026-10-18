import { RegisterScreen } from '@vtp/mobile-core';
import { router } from 'expo-router';

export default function Register() {
  return <RegisterScreen onSignIn={() => router.back()} />;
}

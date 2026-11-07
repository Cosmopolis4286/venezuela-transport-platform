import type { Metadata } from 'next';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Recuperar la contraseña' };

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}

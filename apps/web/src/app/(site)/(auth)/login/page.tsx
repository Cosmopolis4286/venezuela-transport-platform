import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    // useSearchParams reads the request, so it renders behind a boundary.
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

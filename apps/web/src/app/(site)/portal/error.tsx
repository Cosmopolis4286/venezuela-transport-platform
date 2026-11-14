'use client';

import { SectionError } from '@/components/portal/section-error';

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <SectionError
      error={error}
      retry={retry}
      home={{ href: '/portal', label: 'Volver al portal' }}
    />
  );
}

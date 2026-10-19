import { Suspense } from 'react';
import { SearchForm } from '@/components/search/search-form';

export default function HomePage() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Viaja por Venezuela en autobús o por puesto
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Compara horarios, precios y empresas entre terminales de todo el país.
        </p>
      </div>
      <Suspense fallback={<div className="h-24 rounded-xl border bg-muted/40" />}>
        <SearchForm />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        ¿Tienes una empresa de transporte o una línea de taxis? Publica tus rutas desde el{' '}
        <a href="/portal" className="underline">
          portal de operadores
        </a>
        .
      </p>
    </section>
  );
}

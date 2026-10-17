import { Button } from '@/components/ui/button';
import { publicEnv } from '@/lib/env';

export default function HomePage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Transporte terrestre en Venezuela</h1>
      <p className="max-w-2xl text-muted-foreground">
        Entorno de desarrollo listo. La búsqueda de autobuses y las reservas aún no están
        implementadas.
      </p>
      <div>
        <Button asChild variant="outline">
          <a href={`${publicEnv.NEXT_PUBLIC_API_BASE_URL}/health`} target="_blank" rel="noreferrer">
            Ver estado de la API
          </a>
        </Button>
      </div>
    </section>
  );
}

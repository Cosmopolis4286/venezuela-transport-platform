import type { Service } from '@vtp/shared-types';
import Link from 'next/link';
import { getMessages } from '@/i18n/locale';

/**
 * "Between cities · Suburban" (ADR-029). Rendered only when both services are on sale, so with a
 * single service the page looks exactly as before. Links, not buttons: shareable, no JavaScript.
 */
export async function ServiceTabs({
  open,
  current,
  href,
}: {
  open: Service[];
  current: Service;
  href: (service: Service) => string;
}) {
  if (open.length < 2) return null;
  const { t, shared } = await getMessages();
  return (
    <nav aria-label={t.home.services} className="flex w-fit rounded-lg border bg-card p-1">
      {open.map((service) => {
        const selected = service === current;
        return (
          <Link
            key={service}
            href={href(service)}
            aria-current={selected ? 'page' : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${
              selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            {shared.service[service]}
          </Link>
        );
      })}
    </nav>
  );
}

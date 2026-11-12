import { LEGAL_PAGES } from '@vtp/shared-types';
import Link from 'next/link';
import type { Messages } from '@/i18n/messages';

/** Links to the legal documents, at the bottom of every page. */
export function LegalFooter({
  segment,
  t,
  support,
}: {
  segment: string;
  t: Messages['legal'];
  /** Rendered first, e.g. the WhatsApp support link. */
  support?: React.ReactNode;
}) {
  const links = [
    [LEGAL_PAGES.terms, t.terms],
    [LEGAL_PAGES.privacy, t.privacy],
    [LEGAL_PAGES.refunds, t.refunds],
    [LEGAL_PAGES.operators, t.operators],
    [LEGAL_PAGES.cookies, t.cookies],
  ] as const;
  return (
    <footer className="border-t">
      <nav
        aria-label={t.footer}
        className="mx-auto flex max-w-5xl flex-wrap gap-x-4 gap-y-2 px-6 py-6 text-sm text-muted-foreground"
      >
        {support}
        {links.map(([slug, label]) => (
          <Link key={slug} href={`/${segment}/legal/${slug}`} className="hover:underline">
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

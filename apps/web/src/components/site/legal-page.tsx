import { localeSegment } from '@vtp/shared-types';
import type { Metadata } from 'next';
import { LegalDocument } from '@/components/site/legal-document';
import { Alert } from '@/components/ui/alert';
import { LEGAL } from '@/content/legal.generated';
import { getMessages } from '@/i18n/locale';

const find = (slug: string) => {
  const doc = LEGAL.documents.find((d) => d.slug === slug);
  if (!doc) throw new Error(`Unknown legal document ${slug}`);
  return doc;
};

export function legalMetadata(slug: string): Metadata {
  return { title: find(slug).title };
}

/** A legal document (docs/legal), one static route per document. The Spanish text governs. */
export async function LegalPage({ slug }: { slug: string }) {
  const doc = find(slug);
  const { locale, t } = await getMessages();
  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold" lang="es">
        {doc.title}
      </h1>
      {LEGAL.reviewed ? null : <Alert>{t.legal.preliminary}</Alert>}
      {locale === 'es' ? null : <Alert>{t.legal.spanishGoverns}</Alert>}
      <div lang="es">
        <LegalDocument markdown={doc.markdown} base={`/${localeSegment(locale)}/legal`} />
      </div>
    </article>
  );
}

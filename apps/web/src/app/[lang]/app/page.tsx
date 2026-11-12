import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/i18n/locale';
import type { Messages } from '@/i18n/messages';
import { getSupport } from '@/lib/server/network';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return { title: t.support.appTitle };
}

/**
 * `/es/app`: one stable link to share (WhatsApp quick replies, posters) that sends people to the
 * Android app, wherever `ANDROID_APP_URL` points today (the APK during the pilot, Google Play later).
 */
export default async function AppPage() {
  const { t } = await getMessages();
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.support.appTitle}</h1>
      <p className="text-muted-foreground">{t.support.appIntro}</p>
      <Suspense fallback={null}>
        <Download t={t.support} />
      </Suspense>
      <p className="text-sm text-muted-foreground">{t.support.appIphone}</p>
    </section>
  );
}

async function Download({ t }: { t: Messages['support'] }) {
  const { androidApp } = await getSupport();
  if (!androidApp) return <p className="font-medium">{t.appSoon}</p>;
  return (
    <div>
      <Button asChild size="lg">
        <a href={androidApp} rel="noopener noreferrer">
          {t.appAndroid}
        </a>
      </Button>
    </div>
  );
}

import type { Metadata } from 'next';
import { LegalFooter } from '@/components/site/legal-footer';
import { MESSAGES } from '@/i18n/messages';
import '../globals.css';

export const metadata: Metadata = {
  title: {
    default: 'VTP · Transporte terrestre en Venezuela',
    template: '%s · VTP',
  },
  description: 'Busca y reserva viajes en autobús en Venezuela.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-VE" className="h-full">
      <body className="flex min-h-full flex-col font-sans">
        <div className="flex flex-1 flex-col">{children}</div>
        <LegalFooter segment="es" t={MESSAGES.es.legal} />
      </body>
    </html>
  );
}

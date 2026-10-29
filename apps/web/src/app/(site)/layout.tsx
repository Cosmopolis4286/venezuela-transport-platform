import type { Metadata } from 'next';
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
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}

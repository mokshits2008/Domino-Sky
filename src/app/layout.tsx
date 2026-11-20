import type { Metadata } from 'next';
import { DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { SeveritySvgPatterns } from '@/components/common/Patterns';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Domino Sky — Flight Disruption Cascade Simulator',
  description: 'Deterministic flight network cascade simulator and number-safe AI recovery dispatcher.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen bg-canvas text-ink antialiased selection:bg-primary-tint selection:text-ink">
        <SeveritySvgPatterns />
        {children}
      </body>
    </html>
  );
}

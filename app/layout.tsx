import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans, Nunito } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const body = Instrument_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body' });
const nunito = Nunito({ subsets: ['latin'], display: 'swap', variable: '--font-nunito' });
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono-ui' });

export const metadata: Metadata = {
  title: 'Social Media Production Dashboard',
  description: 'Endpoint Clients – Social Media Production Dashboard',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${nunito.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

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
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

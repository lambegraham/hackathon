import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' });
const sans = Inter_Tight({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Got credits? :) — Conversation Coach',
  description: 'A sunflower that senses how you feel, adapts its tone, and helps you rehearse the conversations that matter.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${sans.variable}`}><body>{children}</body></html>;
}

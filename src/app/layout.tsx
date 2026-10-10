import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rehearsal — Conversation Coach',
  description: 'A little practice for the conversations that matter. Rehearse with an AI counterpart and get practical feedback.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning: browser extensions (e.g. Grammarly) inject attributes on <body>.
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}

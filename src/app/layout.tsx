import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'OSINT//LENS — visual intelligence',
  description: 'Reverse image search, geolocation and forensics powered by your own Gemini API key.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${mono.variable}`}>
      <body className="min-h-screen font-mono">
        <div className="relative z-10">{children}</div>
        <div className="pointer-events-none fixed bottom-2 right-3 z-50 select-none text-[10px] tracking-widest text-amber-600/40 font-mono">
          made by saksham paudel
        </div>
      </body>
    </html>
  );
} 

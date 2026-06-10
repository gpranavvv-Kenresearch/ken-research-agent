import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { UserProvider } from '@/context/UserContext';
import ClientShell from '@/components/ClientShell';

export const metadata: Metadata = {
  title: 'Ken Research Distribution Dashboard',
  description: 'Generate and distribute Ken Research content across 14+ platforms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-slate-200 antialiased">
        <UserProvider>
          <Navbar />
          <ClientShell>
            <main className="max-w-screen-2xl mx-auto px-6 py-6">{children}</main>
          </ClientShell>
        </UserProvider>
      </body>
    </html>
  );
}

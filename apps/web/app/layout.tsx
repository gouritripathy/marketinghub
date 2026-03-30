import './globals.css';
import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';

export const metadata = {
  title: 'MarketingHub',
  description: 'AI agent dashboard for marketing teams',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      <AuthProvider>{children}</AuthProvider>
    </body>
  </html>
);

export default RootLayout;

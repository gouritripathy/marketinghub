import type { ReactNode } from 'react';
import AppShell from '../../components/layout/AppShell';

const AppLayout = ({ children }: { children: ReactNode }) => <AppShell>{children}</AppShell>;

export default AppLayout;

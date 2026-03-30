'use client';

import { ShieldAlert } from 'lucide-react';
import UserManagementCard from '../../../components/dashboard/UserManagementCard';
import { useAuth } from '../../../lib/auth/AuthProvider';

const UserManagementPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  if (!isAdmin) {
    return (
      <section className="space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">User Management</h1>
          <p className="text-sm text-slate-400">Manage team access and permissions from a single control panel.</p>
        </header>
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Admin access required</p>
            <p className="mt-1 text-sm text-amber-200/90">
              You do not have permission to access this page. Contact an administrator for access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">User Management</h1>
        <p className="text-sm text-slate-400">
          Create and manage team members with role-based access for Marketing Hub.
        </p>
      </header>
      <UserManagementCard />
    </section>
  );
};

export default UserManagementPage;

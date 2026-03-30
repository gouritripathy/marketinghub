'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';

const Topbar = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const initials =
    user?.name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? 'U';

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center">
          <p className="text-sm text-slate-300">Dashboard workspace</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-200 transition hover:border-slate-600"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-100">
                {initials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-semibold text-slate-100">
                  {user?.name ?? 'User'}
                </span>
                <span className="block text-[11px] text-slate-400">{user?.role ?? 'Member'}</span>
              </span>
              <UserCircle2 className="h-4 w-4 text-slate-400 sm:hidden" />
            </button>

            {open ? (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-xl">
                <div className="px-3 py-2">
                  <p className="text-xs text-slate-400">Signed in as</p>
                  <p className="text-sm font-semibold text-slate-100">{user?.email ?? 'user@company.com'}</p>
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                >
                  <UserCircle2 className="h-4 w-4 text-slate-400" />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '../../../components/LoginForm';
import { useAuth } from '../../../lib/auth/AuthProvider';

const LoginPage = () => {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [router, status]);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12">
      <section className="mx-auto grid w-full max-w-5xl gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-indigo-200">
            MarketingHub
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold leading-tight text-slate-100">
              Strategy operations dashboard for modern marketing teams
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-400">
              Securely sign in to track strategic goals, manage team access, and run your marketing workflow from a
              single dashboard.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
            <p className="font-medium text-slate-200">Security notice</p>
            <p className="mt-1 text-slate-400">
              Access is role-based. Admin users can onboard new users directly from the dashboard.
            </p>
          </div>
        </div>

        <div className="w-full max-w-md justify-self-center md:justify-self-end">
          <LoginForm />
        </div>
      </section>
    </div>
  );
};

export default LoginPage;

 'use client';

 import { useRouter } from 'next/navigation';
 import { useState } from 'react';

 const LogoutButton = () => {
   const router = useRouter();
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);

   const handleLogout = async () => {
     setLoading(true);
     setError(null);
     try {
       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
         method: 'POST',
         credentials: 'include',
       });
       if (!res.ok) {
         setError('Logout failed');
         return;
       }
       router.push('/');
       router.refresh();
     } catch {
       setError('Logout failed');
     } finally {
       setLoading(false);
     }
   };

   return (
     <div className="flex flex-col items-start gap-2">
       <button
         type="button"
         onClick={handleLogout}
         disabled={loading}
         className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:text-white disabled:opacity-60"
       >
         {loading ? 'Signing out...' : 'Sign out'}
       </button>
       {error ? <p className="text-xs text-rose-400">{error}</p> : null}
     </div>
   );
 };

 export default LogoutButton;

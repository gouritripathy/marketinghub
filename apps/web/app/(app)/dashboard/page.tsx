const DashboardPage = () => (
  <section className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
      <p className="text-sm text-slate-400">
        Marketing Hub MVP focused on one core workflow: strategy visibility and execution tracking.
      </p>
    </header>

    <div className="grid gap-4 md:grid-cols-3">
      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Primary KPI</p>
        <p className="mt-2 text-xl font-semibold text-slate-100">Pipeline conversion</p>
        <p className="mt-1 text-sm text-slate-400">Track weekly growth for your highest-priority campaigns.</p>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Focus this sprint</p>
        <p className="mt-2 text-xl font-semibold text-slate-100">3 strategic bets</p>
        <p className="mt-1 text-sm text-slate-400">Keep the roadmap narrow to improve shipping speed and quality.</p>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Cadence</p>
        <p className="mt-2 text-xl font-semibold text-slate-100">Weekly review</p>
        <p className="mt-1 text-sm text-slate-400">Use this dashboard as the single source for planning decisions.</p>
      </article>
    </div>

  </section>
);

export default DashboardPage;

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Crosshair, Download, Loader2, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type LeadResult = {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  leadScore: number;
  salesRationale: string;
  evidenceUrl: string;
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700'
      : score >= 50
        ? 'bg-amber-900/30 text-amber-300 border-amber-700'
        : 'bg-red-900/30 text-red-300 border-red-700';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function LeadResultsPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  const [results, setResults] = useState<LeadResult[]>([]);
  const [loading, setLoading] = useState(true);

  const loadResults = useCallback(async () => {
    if (!runId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/leadgen/runs/${runId}/results`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const handleExport = () => {
    if (!runId) return;
    window.open(`${API_URL}/leadgen/runs/${runId}/export`, '_blank');
  };

  if (!runId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-3 p-8">
        <Crosshair className="h-10 w-10 text-slate-500" />
        <p className="text-sm text-slate-400">Select a pipeline run to view lead results.</p>
        <a
          href="/lead-gen/runs"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Go to Pipeline Runs
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Results</h1>
          <p className="mt-1 text-sm text-slate-400">
            {results.length} verified leads from run {runId.slice(0, 8)}
          </p>
        </div>
        {results.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white transition hover:bg-slate-700"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
          <Crosshair className="mx-auto h-10 w-10 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">
            No verified leads in this run. The pipeline may still be processing, or all candidates were filtered out.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {results.map((lead) => (
                <tr key={lead.id} className="bg-slate-900/30 transition hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.leadScore} />
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {lead.firstName} {lead.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{lead.title}</td>
                  <td className="px-4 py-3 text-slate-300">{lead.company}</td>
                  <td className="px-4 py-3">
                    <span className="text-indigo-400">{lead.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={lead.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Sales Rationale</h2>
          {results.map((lead) => (
            <div key={lead.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-sm font-medium text-white">
                {lead.firstName} {lead.lastName} — {lead.company}
              </p>
              <p className="mt-1 text-sm text-slate-300">{lead.salesRationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

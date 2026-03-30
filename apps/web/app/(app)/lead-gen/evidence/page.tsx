'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type Candidate = {
  id: string;
  rawName: string;
  rawCompany: string;
  status: string;
  evidenceSnippet: string | null;
  sourceUrl: string | null;
  sourceQuality: string | null;
  verifiedFirstName: string | null;
  verifiedTitle: string | null;
  verifiedCompany: string | null;
  verifiedEmail: string | null;
  leadScore: number | null;
  droppedAtLayer: string | null;
  dropReason: string | null;
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  DISCOVERED: { icon: <Search className="h-3.5 w-3.5" />, label: 'Discovered', color: 'text-slate-400' },
  VERIFIED: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Verified', color: 'text-blue-400' },
  CONTACT_RESOLVED: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Contact Found', color: 'text-indigo-400' },
  SCORED: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: 'Scored', color: 'text-emerald-400' },
  DROPPED: { icon: <XCircle className="h-3.5 w-3.5" />, label: 'Dropped', color: 'text-red-400' },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function EvidenceExplorerPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  const loadCandidates = useCallback(async () => {
    if (!runId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/leadgen/runs/${runId}/candidates`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const filtered = filter === 'ALL' ? candidates : candidates.filter((c) => c.status === filter);

  if (!runId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-3 p-8">
        <Search className="h-10 w-10 text-slate-500" />
        <p className="text-sm text-slate-400">Select a pipeline run to explore the evidence trail.</p>
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
      <div>
        <h1 className="text-2xl font-bold text-white">Evidence Explorer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Full audit trail for {candidates.length} candidates in run {runId.slice(0, 8)}
        </p>
      </div>

      <div className="flex gap-2">
        {['ALL', 'SCORED', 'VERIFIED', 'DROPPED'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {f === 'ALL' ? `All (${candidates.length})` : `${f} (${candidates.filter((c) => c.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((candidate) => {
          const config = statusConfig[candidate.status] ?? statusConfig.DISCOVERED;
          return (
            <div key={candidate.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={config.color}>{config.icon}</span>
                    <span className="text-sm font-medium text-white">{candidate.rawName}</span>
                    <span className="text-xs text-slate-500">at {candidate.rawCompany}</span>
                    {candidate.sourceQuality && (
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {candidate.sourceQuality}
                      </span>
                    )}
                  </div>

                  {candidate.verifiedTitle && (
                    <p className="text-xs text-slate-400">
                      Verified: {candidate.verifiedTitle} at {candidate.verifiedCompany}
                    </p>
                  )}

                  {candidate.evidenceSnippet && (
                    <blockquote className="mt-2 border-l-2 border-indigo-500 pl-3 text-xs text-slate-300 italic">
                      &quot;{candidate.evidenceSnippet.slice(0, 300)}&quot;
                    </blockquote>
                  )}

                  {candidate.status === 'DROPPED' && candidate.dropReason && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      Dropped at {candidate.droppedAtLayer}: {candidate.dropReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1">
                  {candidate.leadScore != null && candidate.leadScore > 0 && (
                    <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs font-bold text-emerald-300">
                      {candidate.leadScore}
                    </span>
                  )}
                  {candidate.sourceUrl && (
                    <a
                      href={candidate.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Source
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

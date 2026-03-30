'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, CheckCircle, XCircle, Clock, Loader2, Eye } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  runs: Array<{
    id: string;
    status: string;
    currentLayer: string | null;
    totalCost: number;
    creditsUsed: number;
    createdAt: string;
    completedAt: string | null;
  }>;
};

const statusIcons: Record<string, React.ReactNode> = {
  QUEUED: <Clock className="h-4 w-4 text-slate-400" />,
  RUNNING: <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />,
  COMPLETED: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
};

const layerLabels: Record<string, string> = {
  CONTEXT_ENGINE: 'Analyzing Offering',
  STRATEGY_AGENT: 'Building Search Strategy',
  HUNTER: 'Discovering Candidates',
  VERIFIER: 'Verifying Identities',
  POSTMAN: 'Resolving Contacts',
  JUDGE: 'Scoring Leads',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function PipelineRunsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/leadgen/campaigns`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.data ?? []);
      }
    } catch {
      // silently fail on network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    const interval = setInterval(() => void loadCampaigns(), 5000);
    return () => clearInterval(interval);
  }, [loadCampaigns]);

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
        <h1 className="text-2xl font-bold text-white">Pipeline Runs</h1>
        <p className="mt-1 text-sm text-slate-400">Track your lead generation campaigns and pipeline executions.</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
          <Activity className="mx-auto h-10 w-10 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">No campaigns yet. Create your first campaign to get started.</p>
          <a
            href="/lead-gen/new"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New Campaign
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{campaign.name}</h3>
                  <p className="text-xs text-slate-500">
                    Created {new Date(campaign.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    campaign.status === 'COMPLETED'
                      ? 'bg-emerald-900/30 text-emerald-300'
                      : campaign.status === 'ACTIVE'
                        ? 'bg-indigo-900/30 text-indigo-300'
                        : campaign.status === 'FAILED'
                          ? 'bg-red-900/30 text-red-300'
                          : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {campaign.status}
                </span>
              </div>

              {campaign.runs.length > 0 && (
                <div className="mt-4 space-y-2">
                  {campaign.runs.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between rounded-md bg-slate-900/50 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        {statusIcons[run.status] ?? statusIcons.QUEUED}
                        <div>
                          <p className="text-xs font-medium text-slate-200">
                            Run {run.id.slice(0, 8)}
                          </p>
                          {run.currentLayer && run.status === 'RUNNING' && (
                            <p className="text-xs text-indigo-400">
                              {layerLabels[run.currentLayer] ?? run.currentLayer}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        {run.creditsUsed > 0 && <span>{run.creditsUsed} leads</span>}
                        {run.totalCost > 0 && <span>${run.totalCost.toFixed(2)}</span>}
                        <a
                          href={`/lead-gen/tracker/${run.id}`}
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                        >
                          <Eye className="h-3 w-3" /> Track
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Globe,
  Target,
  Search,
  ShieldCheck,
  Mail,
  Award,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ArrowDown,
  Users,
  Zap,
  ExternalLink,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type LayerLog = {
  layer: string;
  status: string;
  durationMs: number | null;
  telemetryJson: { layer_confidence?: number; reasoning?: string } | null;
  llmProvider: string | null;
  llmModel: string | null;
  apiCost: number | null;
  errorMessage: string | null;
};

type RunData = {
  id: string;
  status: string;
  currentLayer: string | null;
  totalCost: number;
  creditsUsed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  layerLogs: LayerLog[];
  campaign: { name: string; teamId: string };
  _count: { results: number; candidates: number };
};

const LAYERS = [
  {
    key: 'CONTEXT_ENGINE',
    name: 'Context Engine',
    description: 'Analyzing your service offering and building the Offering Blueprint',
    icon: Globe,
    color: 'indigo',
  },
  {
    key: 'STRATEGY_AGENT',
    name: 'Strategy Agent',
    description: 'Generating targeted search queries for decision-makers',
    icon: Target,
    color: 'violet',
  },
  {
    key: 'HUNTER',
    name: 'The Hunter',
    description: 'Scouring the web for prospects with verifiable intent signals',
    icon: Search,
    color: 'blue',
  },
  {
    key: 'VERIFIER',
    name: 'The Verifier',
    description: 'Confirming current employment via LinkedIn data',
    icon: ShieldCheck,
    color: 'amber',
  },
  {
    key: 'POSTMAN',
    name: 'The Postman',
    description: 'Resolving and verifying email deliverability',
    icon: Mail,
    color: 'cyan',
  },
  {
    key: 'JUDGE',
    name: 'The Judge',
    description: 'Scoring leads and generating sales rationale',
    icon: Award,
    color: 'emerald',
  },
];

function getLayerStatus(
  layerKey: string,
  logs: LayerLog[],
  currentLayer: string | null,
  runStatus: string,
): 'pending' | 'running' | 'completed' | 'failed' {
  const log = logs.find((l) => l.layer === layerKey);
  if (log) {
    if (log.status === 'COMPLETED') return 'completed';
    if (log.status === 'FAILED') return 'failed';
    if (log.status === 'RUNNING') return 'running';
  }
  if (currentLayer === layerKey && runStatus === 'RUNNING') return 'running';
  return 'pending';
}

function LayerCard({
  layer,
  status,
  log,
  isLast,
}: {
  layer: (typeof LAYERS)[number];
  status: 'pending' | 'running' | 'completed' | 'failed';
  log: LayerLog | undefined;
  isLast: boolean;
}) {
  const Icon = layer.icon;

  const ringColors: Record<string, string> = {
    pending: 'border-slate-700 bg-slate-800/40',
    running: 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20',
    completed: 'border-emerald-600 bg-emerald-500/10',
    failed: 'border-red-600 bg-red-500/10',
  };

  const iconColors: Record<string, string> = {
    pending: 'text-slate-500',
    running: 'text-indigo-400',
    completed: 'text-emerald-400',
    failed: 'text-red-400',
  };

  const confidence = log?.telemetryJson?.layer_confidence;
  const reasoning = log?.telemetryJson?.reasoning;

  return (
    <div className="relative">
      <div
        className={`rounded-xl border-2 p-5 transition-all duration-500 ${ringColors[status]}`}
      >
        <div className="flex items-start gap-4">
          {/* Icon + status indicator */}
          <div className="relative flex-shrink-0">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                status === 'running'
                  ? 'bg-indigo-500/20'
                  : status === 'completed'
                    ? 'bg-emerald-500/20'
                    : status === 'failed'
                      ? 'bg-red-500/20'
                      : 'bg-slate-700/50'
              }`}
            >
              {status === 'running' ? (
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              ) : status === 'completed' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : status === 'failed' ? (
                <XCircle className="h-6 w-6 text-red-400" />
              ) : (
                <Icon className={`h-6 w-6 ${iconColors[status]}`} />
              )}
            </div>
            {status === 'running' && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
              </span>
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3
                className={`text-sm font-semibold ${
                  status === 'pending' ? 'text-slate-400' : 'text-white'
                }`}
              >
                {layer.name}
              </h3>
              <div className="flex items-center gap-3">
                {confidence != null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      confidence >= 70
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : confidence >= 40
                          ? 'bg-amber-900/40 text-amber-300'
                          : 'bg-red-900/40 text-red-300'
                    }`}
                  >
                    {confidence}%
                  </span>
                )}
                {log?.durationMs != null && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3 w-3" />
                    {(log.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>

            <p
              className={`mt-0.5 text-xs ${
                status === 'running' ? 'text-indigo-300' : 'text-slate-500'
              }`}
            >
              {status === 'running'
                ? layer.description
                : status === 'pending'
                  ? 'Waiting...'
                  : layer.description}
            </p>

            {/* Reasoning detail for completed/failed */}
            {reasoning && status !== 'pending' && (
              <p className="mt-2 rounded-lg bg-slate-900/50 px-3 py-2 text-xs text-slate-400 italic">
                {reasoning}
              </p>
            )}

            {/* Error message */}
            {log?.errorMessage && status === 'failed' && (
              <p className="mt-2 rounded-lg bg-red-900/20 px-3 py-2 text-xs text-red-300">
                {log.errorMessage}
              </p>
            )}

            {/* Model info */}
            {log?.llmProvider && status === 'completed' && (
              <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-600">
                <span>{log.llmProvider}/{log.llmModel}</span>
                {log.apiCost != null && log.apiCost > 0 && (
                  <span>${log.apiCost.toFixed(3)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div className="flex justify-center py-2">
          <ArrowDown
            className={`h-5 w-5 ${
              status === 'completed'
                ? 'text-emerald-600'
                : status === 'running'
                  ? 'text-indigo-500 animate-bounce'
                  : 'text-slate-700'
            }`}
          />
        </div>
      )}
    </div>
  );
}

export default function PipelineTrackerPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/leadgen/runs/${runId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load run');
      const data = await res.json();
      setRun(data.data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const isTerminal = run?.status === 'COMPLETED' || run?.status === 'FAILED' || run?.status === 'CANCELLED';

  useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    if (isTerminal) return;
    const interval = setInterval(() => void fetchRun(), 2000);
    return () => clearInterval(interval);
  }, [isTerminal, fetchRun]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="text-sm text-slate-400">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-400">{error || 'Run not found'}</p>
      </div>
    );
  }

  const elapsed =
    run.startedAt && run.completedAt
      ? ((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)
      : run.startedAt
        ? ((Date.now() - new Date(run.startedAt).getTime()) / 1000).toFixed(0)
        : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">{run.campaign.name}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              run.status === 'COMPLETED'
                ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700'
                : run.status === 'FAILED'
                  ? 'bg-red-900/30 text-red-300 border border-red-700'
                  : run.status === 'RUNNING'
                    ? 'bg-indigo-900/30 text-indigo-300 border border-indigo-700'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {run.status === 'RUNNING' ? 'Running...' : run.status}
          </span>
        </div>
        <p className="text-xs text-slate-500">Run {runId.slice(0, 8)}</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            icon: Clock,
            label: 'Elapsed',
            value: elapsed ? `${elapsed}s` : '—',
            color: 'text-slate-300',
          },
          {
            icon: Users,
            label: 'Candidates',
            value: String(run._count.candidates),
            color: 'text-blue-300',
          },
          {
            icon: Zap,
            label: 'Leads',
            value: String(run._count.results),
            color: 'text-emerald-300',
          },
          {
            icon: Award,
            label: 'Cost',
            value: run.totalCost > 0 ? `$${run.totalCost.toFixed(2)}` : '—',
            color: 'text-amber-300',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2.5 text-center"
          >
            <stat.icon className={`mx-auto h-4 w-4 ${stat.color} mb-1`} />
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline visual */}
      <div className="space-y-0">
        {LAYERS.map((layer, i) => {
          const status = getLayerStatus(
            layer.key,
            run.layerLogs,
            run.currentLayer,
            run.status,
          );
          const log = run.layerLogs.find((l) => l.layer === layer.key);

          return (
            <LayerCard
              key={layer.key}
              layer={layer}
              status={status}
              log={log}
              isLast={i === LAYERS.length - 1}
            />
          );
        })}
      </div>

      {/* Error banner */}
      {run.status === 'FAILED' && run.errorMessage && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3">
          <p className="text-sm font-medium text-red-300">Pipeline Failed</p>
          <p className="mt-1 text-xs text-red-400">{run.errorMessage}</p>
        </div>
      )}

      {/* Results link */}
      {run.status === 'COMPLETED' && run._count.results > 0 && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-5 py-4">
          <p className="text-sm font-semibold text-emerald-300">
            Pipeline complete — {run._count.results} verified leads found
          </p>
          <p className="mt-1 text-xs text-emerald-400/70">
            {run._count.candidates} candidates discovered, {run._count.results} passed all validation gates
          </p>
          <div className="mt-3 flex gap-3">
            <a
              href={`/lead-gen/results?runId=${runId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              View Leads <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`/lead-gen/evidence?runId=${runId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Evidence Trail <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

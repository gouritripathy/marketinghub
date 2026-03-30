'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Link as LinkIcon, FileText, Loader2 } from 'lucide-react';

type InputMode = 'url' | 'text';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function NewCampaignPage() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>('url');
  const [name, setName] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [geography, setGeography] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const config: Record<string, unknown> = {};
      if (geography.trim()) config.targetGeography = geography.split(',').map((g) => g.trim());
      if (companySize.trim()) config.targetCompanySize = companySize;
      if (industry.trim()) config.industryVertical = industry.split(',').map((i) => i.trim());

      const campaignRes = await fetch(`${API_URL}/leadgen/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          inputUrl: mode === 'url' ? inputUrl : undefined,
          inputText: mode === 'text' ? inputText : undefined,
          config: Object.keys(config).length > 0 ? config : undefined,
        }),
      });

      if (!campaignRes.ok) {
        const err = await campaignRes.json();
        throw new Error(err.error?.message ?? 'Failed to create campaign');
      }

      const campaign = await campaignRes.json();
      const campaignId = campaign.data.id;

      const runRes = await fetch(`${API_URL}/leadgen/campaigns/${campaignId}/run`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!runRes.ok) {
        const err = await runRes.json();
        throw new Error(err.error?.message ?? 'Failed to start pipeline');
      }

      const run = await runRes.json();
      router.push(`/lead-gen/tracker/${run.data.runId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Lead Campaign</h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste your B2B service offering URL or describe it, and our AI agents will find verified leads.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300">Campaign Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pharma PPM Maturity Assessment Q1"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Input Method</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
                mode === 'url'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <LinkIcon className="h-4 w-4" /> Paste URL
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
                mode === 'text'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <FileText className="h-4 w-4" /> Describe Offering
            </button>
          </div>
        </div>

        {mode === 'url' ? (
          <div>
            <label className="block text-sm font-medium text-slate-300">Service Offering URL</label>
            <input
              type="url"
              required={mode === 'url'}
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://yourcompany.com/services/pharma-ppm"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-300">Describe Your Offering</label>
            <textarea
              required={mode === 'text'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={5}
              placeholder="Describe your B2B service in detail. The more context, the better the leads..."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}

        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-4">
          <p className="text-sm font-medium text-slate-300">Filters (Optional)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-slate-400">Geography</label>
              <input
                type="text"
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="North America, EU"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Company Size</label>
              <input
                type="text"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="500-10000"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Pharma, Biotech"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Launching Agents...
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4" /> Generate Leads
            </>
          )}
        </button>
      </form>
    </div>
  );
}

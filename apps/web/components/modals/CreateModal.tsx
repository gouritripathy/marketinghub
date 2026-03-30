'use client';

import { FileText, LineChart, Send, X } from 'lucide-react';

type CreateModalProps = {
  open: boolean;
  onClose: () => void;
};

const actions = [
  {
    label: 'New Draft',
    description: 'Start a fresh content draft.',
    icon: FileText,
  },
  {
    label: 'New Post',
    description: 'Publish a new social post.',
    icon: Send,
  },
  {
    label: 'New Insight',
    description: 'Log a competitive or market insight.',
    icon: LineChart,
  },
];

const CreateModal = ({ open, onClose }: CreateModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Create</h2>
            <p className="text-xs text-slate-400">Kick off a new workflow in seconds.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:text-slate-200"
            aria-label="Close create modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                className="flex w-full items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-slate-600"
              >
                <span className="mt-0.5 rounded-lg bg-slate-900 p-2 text-indigo-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-100">{action.label}</span>
                  <span className="block text-xs text-slate-400">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CreateModal;

export const contentGoals = [
  'BLOG',
  'LANDING',
  'CASE_STUDY',
  'WHITEPAPER',
  'LINKEDIN',
  'EMAIL',
  'CUSTOM',
] as const;

export type ContentGoal = (typeof contentGoals)[number];

export const approvalStages = ['BRAND', 'LEGAL', 'MANAGER'] as const;

export type ApprovalStage = (typeof approvalStages)[number];

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export type DraftSummary = {
  id: string;
  contentGoal: ContentGoal;
  topic: string;
  persona: string;
  status: 'DRAFTING' | 'IN_REVIEW' | 'FINAL';
  versions: {
    id: string;
    versionNumber: number;
    status: 'DRAFT' | 'SUBMITTED' | 'FINAL' | 'REJECTED';
    createdAt: string;
  }[];
};

export type DraftVersion = {
  id: string;
  draftId: string;
  versionNumber: number;
  inputSnapshotJson: Record<string, unknown>;
  briefJson: Record<string, unknown>;
  evidenceJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  humanReadable: string;
  status: 'DRAFT' | 'SUBMITTED' | 'FINAL' | 'REJECTED';
  createdAt: string;
};

type CreateDraftResponse = {
  draftId: string;
  versionId: string;
};

type ApprovalResponse = {
  approvalId: string;
};

type PipelineResponse = {
  versionId: string;
  brief: Record<string, unknown>;
  evidence: Record<string, unknown>;
  outputJson: Record<string, unknown>;
};

const getApiBaseUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
  return baseUrl.replace(/\/$/, '');
};

const parseResponse = async <T>(res: Response) => {
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message ?? 'Request failed');
  }
  return body.data as T;
};

export const contentClient = {
  createDraft: async (payload: {
    contentGoal: ContentGoal;
    topic: string;
    persona: string;
    inputSnapshot: Record<string, unknown>;
  }) => {
    const res = await fetch(`${getApiBaseUrl()}/content/drafts`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<CreateDraftResponse>(res);
  },
  getDraft: async (draftId: string) => {
    const res = await fetch(`${getApiBaseUrl()}/content/drafts/${draftId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    return parseResponse<DraftSummary>(res);
  },
  getVersion: async (versionId: string) => {
    const res = await fetch(`${getApiBaseUrl()}/content/versions/${versionId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    return parseResponse<DraftVersion>(res);
  },
  saveVersion: async (versionId: string, payload: { outputJson: unknown; humanReadable: string }) => {
    const res = await fetch(`${getApiBaseUrl()}/content/versions/${versionId}/save`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<DraftVersion>(res);
  },
  submitVersion: async (versionId: string) => {
    const res = await fetch(`${getApiBaseUrl()}/content/versions/${versionId}/submit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return parseResponse<ApprovalResponse>(res);
  },
  approve: async (approvalId: string, payload: { reviewerId: string; comments?: string; tags?: string[]; rating?: number }) => {
    const res = await fetch(`${getApiBaseUrl()}/content/approvals/${approvalId}/approve`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<{ draft: DraftSummary; version: DraftVersion; nextApprovalId?: string | null }>(res);
  },
  reject: async (
    approvalId: string,
    payload: { reviewerId: string; comments: string; tags?: string[]; rating?: number },
  ) => {
    const res = await fetch(`${getApiBaseUrl()}/content/approvals/${approvalId}/reject`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse<{ version: DraftVersion }>(res);
  },
  runPipeline: async (
    versionId: string,
    payload: { enableWeb?: boolean; internalSources?: Array<{ title: string; url?: string; text: string }>; steps?: string[] },
  ) => {
    const res = await fetch(`${getApiBaseUrl()}/content/pipeline/${versionId}/run`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    return parseResponse<PipelineResponse>(res);
  },
};

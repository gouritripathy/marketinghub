import { env } from '../../../config/env';

export type EmailFinderResult = {
  email: string | null;
  confidence: number;
  sources?: string[];
};

export type EmailVerifyResult = {
  email: string;
  status: 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'spamtrap' | 'abuse' | 'do_not_mail';
  sub_status?: string;
};

// Hunter.io email finder — resolves name + domain to email
export async function findEmail(
  firstName: string,
  lastName: string,
  domain: string,
): Promise<EmailFinderResult> {
  if (!env.HUNTER_API_KEY) {
    throw new Error('HUNTER_API_KEY is not configured');
  }

  const params = new URLSearchParams({
    domain,
    first_name: firstName,
    last_name: lastName,
    api_key: env.HUNTER_API_KEY,
  });

  const response = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Hunter.io email finder failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: { email?: string; confidence?: number; sources?: Array<{ domain: string }> };
  };

  return {
    email: data.data?.email ?? null,
    confidence: data.data?.confidence ?? 0,
    sources: data.data?.sources?.map((s) => s.domain),
  };
}

// ZeroBounce email verification — SMTP-level deliverability check
export async function verifyEmail(email: string): Promise<EmailVerifyResult> {
  if (!env.ZEROBOUNCE_API_KEY) {
    throw new Error('ZEROBOUNCE_API_KEY is not configured');
  }

  const params = new URLSearchParams({
    api_key: env.ZEROBOUNCE_API_KEY,
    email,
  });

  const response = await fetch(`https://api.zerobounce.net/v2/validate?${params}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ZeroBounce verification failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { status?: string; sub_status?: string };

  const statusMap: Record<string, EmailVerifyResult['status']> = {
    valid: 'valid',
    invalid: 'invalid',
    'catch-all': 'catch-all',
    unknown: 'unknown',
    spamtrap: 'spamtrap',
    abuse: 'abuse',
    do_not_mail: 'do_not_mail',
  };

  return {
    email,
    status: statusMap[data.status?.toLowerCase() ?? ''] ?? 'unknown',
    sub_status: data.sub_status,
  };
}

// Deterministic deliverability evaluation — no LLM needed
export function evaluateDeliverability(status: string): {
  is_valid: boolean;
  confidence: number;
  reasoning: string;
} {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'valid') {
    return { is_valid: true, confidence: 100, reasoning: 'SMTP verified as valid mailbox' };
  }

  const rejectionReasons: Record<string, string> = {
    'catch-all': 'Domain accepts all addresses — deliverability unverifiable',
    invalid: 'Mailbox does not exist',
    unknown: 'SMTP server unresponsive — cannot verify',
    spamtrap: 'Address is a known spam trap',
    abuse: 'Address flagged for abuse complaints',
    do_not_mail: 'Address on do-not-mail suppression list',
    risky: 'Address has elevated bounce risk',
  };

  return {
    is_valid: false,
    confidence: 0,
    reasoning: rejectionReasons[normalizedStatus] ?? `Rejected: status "${status}"`,
  };
}

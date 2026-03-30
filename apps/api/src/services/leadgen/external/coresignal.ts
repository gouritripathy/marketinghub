import { env } from '../../../config/env';

const BASE_URL = 'https://api.coresignal.com/cdapi';

function getApiKey(): string {
  const key = env.CORESIGNAL_API_KEY;
  if (!key) throw new Error('CORESIGNAL_API_KEY is not configured');
  return key;
}

function apiHeaders(): Record<string, string> {
  return {
    apikey: getApiKey(),
    accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type CoresignalExperience = {
  title?: string;
  company_name?: string;
  company_url?: string;
  company_website?: string;
  date_from?: string;
  date_to?: string | null;
  is_current?: number;
  duration?: string;
  description?: string;
  location?: string;
  company_industry?: string;
  company_size_range?: string;
};

export type CoresignalActivity = {
  activity_url?: string;
  title?: string;
  action?: string;
};

export type CoresignalEmployee = {
  id?: number;
  name_first?: string;
  name_last?: string;
  full_name?: string;
  job_title?: string;
  description?: string;
  location?: string;
  location_country?: string;
  is_working?: number;
  experience?: CoresignalExperience[];
  activity?: CoresignalActivity[];
};

export type CoresignalJob = {
  id?: number;
  title?: string;
  company_name?: string;
  description?: string;
  location?: string;
  url?: string;
  created?: string;
  external_url?: string;
};

export type CoresignalCompany = {
  id?: number;
  name?: string;
  website?: string;
  industry?: string;
  description?: string;
  employees_count?: number;
  founded?: number;
  specialties?: string;
  headquarters_city?: string;
  headquarters_country?: string;
  company_type?: string;
};

// ──────────────────────────────────────────────
// 1. Clean Employee API — search + collect
// ──────────────────────────────────────────────

export async function searchEmployee(
  firstName: string,
  lastName: string,
  companyName: string,
): Promise<CoresignalEmployee | null> {
  // Step 1: Search for employee IDs using correct Coresignal ES DSL format
  const mustClauses: unknown[] = [
    { match: { name_first: firstName } },
  ];
  if (lastName) {
    mustClauses.push({ match: { name_last: lastName } });
  }

  const query = {
    query: {
      bool: {
        must: mustClauses,
        should: [
          {
            nested: {
              path: 'experience',
              query: {
                bool: {
                  must: [
                    { match: { 'experience.company_name': companyName } },
                  ],
                },
              },
            },
          },
        ],
      },
    },
    sort: ['_score'],
  };

  const searchResponse = await fetch(`${BASE_URL}/v2/employee_clean/search/es_dsl`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(query),
  });

  if (!searchResponse.ok) {
    const body = await searchResponse.text().catch(() => '');
    throw new Error(`Coresignal employee search failed (${searchResponse.status}): ${body}`);
  }

  const searchData = await searchResponse.json();
  const ids: number[] = Array.isArray(searchData) ? searchData : [];

  console.log(`[Coresignal] Employee search for "${firstName} ${lastName}" at "${companyName}": ${ids.length} IDs returned`);

  if (ids.length === 0) return null;

  // Step 2: Collect full profile for top results (max 3 to save credits)
  const idsToCheck = ids.slice(0, 3);
  const companyLower = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const empId of idsToCheck) {
    try {
      const profile = await collectEmployee(empId);
      if (!profile) continue;

      const experience = profile.experience ?? [];
      const currentJob = experience.find((e) => {
        const isCurrent = e.is_current === 1 || e.date_to === null || e.date_to === undefined;
        if (!isCurrent) return false;
        const eName = (e.company_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return eName.includes(companyLower) || companyLower.includes(eName);
      });

      if (currentJob) {
        console.log(`[Coresignal] MATCH: ${profile.full_name ?? `${profile.name_first} ${profile.name_last}`} — "${currentJob.title}" at "${currentJob.company_name}" (current)`);
        return profile;
      }

      const currentJobs = experience.filter((e) => e.is_current === 1 || e.date_to === null || e.date_to === undefined);
      console.log(`[Coresignal] ID ${empId}: No match at "${companyName}". Current: ${currentJobs.map((e) => `"${e.title}" at "${e.company_name}"`).join(', ') || 'none'}`);
    } catch (err) {
      console.warn(`[Coresignal] Collect ID ${empId} failed: ${(err as Error).message}`);
    }
  }

  return null;
}

async function collectEmployee(employeeId: number): Promise<CoresignalEmployee | null> {
  const response = await fetch(`${BASE_URL}/v2/employee_clean/collect/${employeeId}`, {
    method: 'GET',
    headers: apiHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    const body = await response.text().catch(() => '');
    throw new Error(`Coresignal collect failed (${response.status}): ${body}`);
  }

  return (await response.json()) as CoresignalEmployee;
}

/**
 * Verify current employment from Coresignal employee data.
 */
export function verifyCoresignalEmployment(
  employee: CoresignalEmployee,
  targetCompany: string,
): {
  isCurrentlyEmployed: boolean;
  currentRole: string | null;
  currentCompany: string | null;
  companyDomain: string | null;
  headline: string | null;
  reason: string;
} {
  const experience = employee.experience ?? [];
  if (experience.length === 0) {
    return {
      isCurrentlyEmployed: false,
      currentRole: null,
      currentCompany: null,
      companyDomain: null,
      headline: employee.job_title ?? null,
      reason: 'No work experience data in Coresignal profile',
    };
  }

  const targetLower = targetCompany.toLowerCase().replace(/[^a-z0-9]/g, '');

  const currentJobs = experience.filter(
    (e) => e.is_current === 1 || e.date_to === null || e.date_to === undefined,
  );
  if (currentJobs.length === 0) {
    return {
      isCurrentlyEmployed: false,
      currentRole: null,
      currentCompany: null,
      companyDomain: null,
      headline: employee.job_title ?? null,
      reason: 'No current employment found — all positions have end dates',
    };
  }

  for (const job of currentJobs) {
    const companyLower = (job.company_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = companyLower.includes(targetLower) || targetLower.includes(companyLower);
    if (match) {
      const domain = extractDomainFromUrl(job.company_website ?? job.company_url);
      return {
        isCurrentlyEmployed: true,
        currentRole: job.title ?? 'Unknown',
        currentCompany: job.company_name ?? targetCompany,
        companyDomain: domain,
        headline: employee.job_title ?? null,
        reason: `Currently employed at ${job.company_name} as ${job.title}`,
      };
    }
  }

  const topJob = currentJobs[0];
  return {
    isCurrentlyEmployed: false,
    currentRole: topJob.title ?? null,
    currentCompany: topJob.company_name ?? null,
    companyDomain: null,
    headline: employee.job_title ?? null,
    reason: `Currently at ${topJob.company_name}, not ${targetCompany}`,
  };
}

// ──────────────────────────────────────────────
// 2. Multi-source Jobs API — search active job postings
// ──────────────────────────────────────────────

export async function searchJobPostings(
  companyName: string,
  keywords: string[],
): Promise<CoresignalJob[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sinceDate = sixMonthsAgo.toISOString().slice(0, 10);

  const mustClauses: unknown[] = [
    { match: { company_name: companyName } },
  ];
  if (keywords.length > 0) {
    mustClauses.push({ match: { title: keywords.join(' ') } });
  }

  const query = {
    query: {
      bool: {
        must: mustClauses,
        filter: [
          { range: { created: { gte: sinceDate } } },
        ],
      },
    },
    sort: ['_score'],
  };

  const response = await fetch(`${BASE_URL}/v2/job_multi_source/search/es_dsl`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Coresignal jobs search failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const ids: number[] = Array.isArray(data) ? data : [];
  if (ids.length === 0) return [];

  const jobs: CoresignalJob[] = [];
  for (const jobId of ids.slice(0, 5)) {
    try {
      const res = await fetch(`${BASE_URL}/v2/job_multi_source/collect/${jobId}`, {
        method: 'GET',
        headers: apiHeaders(),
      });
      if (res.ok) {
        jobs.push(await res.json());
      }
    } catch {
      // skip failed collects
    }
  }
  return jobs;
}

// ──────────────────────────────────────────────
// 3. Multi-source Company API — enrich by website URL
// ──────────────────────────────────────────────

export async function enrichCompany(websiteUrl: string): Promise<CoresignalCompany | null> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

  const response = await fetch(
    `${BASE_URL}/v2/company_multi_source/enrich?website=${encodeURIComponent(url)}`,
    { method: 'GET', headers: apiHeaders() },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const body = await response.text().catch(() => '');
    throw new Error(`Coresignal company enrich failed (${response.status}): ${body}`);
  }

  return (await response.json()) as CoresignalCompany;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function extractDomainFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

import { env } from '../../../config/env';

export type NinjaPearWorkExperience = {
  role?: string;
  company_name?: string;
  company_website?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
};

export type NinjaPearEducation = {
  major?: string;
  school?: string;
  start_date?: string | null;
  end_date?: string | null;
};

export type NinjaPearProfile = {
  id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  bio?: string;
  country?: string;
  city?: string;
  state?: string;
  x_handle?: string;
  x_profile_url?: string;
  work_experience?: NinjaPearWorkExperience[];
  education?: NinjaPearEducation[];
};

function getApiKey(): string {
  const key = env.NINJAPEAR_API_KEY;
  if (!key) {
    throw new Error('NINJAPEAR_API_KEY is not configured');
  }
  return key;
}

/**
 * Enrich a person's professional profile using NinjaPear's Employee API.
 * Uses first_name + employer_website for lookup (single API call).
 * Cost: 3 credits per request.
 *
 * @see https://nubela.co/docs#person-profile-endpoint
 */
export async function getPersonProfile(
  firstName: string,
  lastName: string,
  companyDomain: string,
): Promise<NinjaPearProfile | null> {
  const apiKey = getApiKey();

  const employerWebsite = companyDomain.startsWith('http')
    ? companyDomain
    : `https://${companyDomain}`;

  const params = new URLSearchParams({
    first_name: firstName,
    employer_website: employerWebsite,
  });

  if (lastName) {
    params.set('last_name', lastName);
  }

  const response = await fetch(
    `https://nubela.co/api/v1/employee/profile?${params}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    if (response.status === 503) return null;
    const body = await response.text().catch(() => '');
    throw new Error(`NinjaPear profile lookup failed (${response.status}): ${body}`);
  }

  return (await response.json()) as NinjaPearProfile;
}

/**
 * Deterministic employment verification from NinjaPear profile data.
 * Returns null if the person doesn't appear to work at the target company.
 */
export function verifyCurrentEmployment(
  profile: NinjaPearProfile,
  targetCompany: string,
): {
  isCurrentlyEmployed: boolean;
  currentRole: string | null;
  currentCompany: string | null;
  companyDomain: string | null;
  reason: string;
} {
  if (!profile.work_experience || profile.work_experience.length === 0) {
    return {
      isCurrentlyEmployed: false,
      currentRole: null,
      currentCompany: null,
      companyDomain: null,
      reason: 'No work experience data available',
    };
  }

  const currentJobs = profile.work_experience.filter(
    (exp) => exp.end_date === null || exp.end_date === undefined,
  );

  if (currentJobs.length === 0) {
    return {
      isCurrentlyEmployed: false,
      currentRole: null,
      currentCompany: null,
      companyDomain: null,
      reason: 'No current employment found — all positions have end dates',
    };
  }

  const targetLower = targetCompany.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const job of currentJobs) {
    const companyLower = (job.company_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const domainLower = (job.company_website ?? '').toLowerCase().replace(/[^a-z0-9.]/g, '');

    const nameMatch =
      companyLower.includes(targetLower) ||
      targetLower.includes(companyLower) ||
      domainLower.includes(targetLower);

    if (nameMatch) {
      return {
        isCurrentlyEmployed: true,
        currentRole: job.role ?? 'Unknown',
        currentCompany: job.company_name ?? targetCompany,
        companyDomain: job.company_website ?? null,
        reason: `Currently employed at ${job.company_name} as ${job.role}`,
      };
    }
  }

  const topJob = currentJobs[0];
  return {
    isCurrentlyEmployed: false,
    currentRole: topJob.role ?? null,
    currentCompany: topJob.company_name ?? null,
    companyDomain: topJob.company_website ?? null,
    reason: `Currently at ${topJob.company_name}, not ${targetCompany}`,
  };
}

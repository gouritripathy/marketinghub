import { z } from 'zod';
import {
  verifiedIdentitySchema,
  type hunterCandidateSchema,
  type offeringBlueprintSchema,
} from '@marketinghub/shared';
import type { PipelineStage, StageResult } from '../PipelineStage';
import { getLLMRouter } from '../../llm';
import { env } from '../../../config/env';
import {
  searchEmployee,
  verifyCoresignalEmployment,
  searchJobPostings,
  enrichCompany,
  type CoresignalEmployee,
  type CoresignalJob,
  type CoresignalCompany,
} from '../external/coresignal';
import { getPersonProfile, verifyCurrentEmployment } from '../external/ninjapear';
import { semanticSearch, type ExaSearchResult } from '../external/exaSearch';

export type VerifierInput = {
  candidate: z.infer<typeof hunterCandidateSchema>;
  blueprint: z.infer<typeof offeringBlueprintSchema>['offering_blueprint'];
};

export type VerifierOutput = z.infer<typeof verifiedIdentitySchema>;

function splitName(rawName: string): { firstName: string; lastName: string } {
  const parts = rawName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

const BUSINESS_SUFFIXES = /\b(inc|corp|corporation|ltd|llc|limited|plc|sa|ag|gmbh|co|company|pharmaceuticals|pharma|therapeutics|biosciences|biotech|sciences|consulting|group|solutions|technologies|technology|international|global|systems|partners|holdings|enterprises|services)\b/gi;

function companyNameToDomain(company: string): string {
  const stripped = company
    .toLowerCase()
    .replace(BUSINESS_SUFFIXES, '')
    .replace(/[^a-z0-9]/g, '');
  return stripped ? `${stripped}.com` : `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
}

const SYSTEM_PROMPT = `You are a Senior B2B Market Researcher and Data Integrity Lead. A profile API has ALREADY confirmed that this person currently works at the target company. Your job is to:
1. Look for CONTRADICTING evidence — any web signal that the person recently LEFT this company.
2. Evaluate company intent and fit for our offering.

You have been provided with:
- The candidate's Name, Company, and verified Title (from profile API).
- The Offering Blueprint (the service we are selling).
- Company firmographics (industry, size, specialties).
- Active job postings at the company matching our keywords.
- Live web search results for person recency and company news.

STRICT RULES:
1. DEPARTURE OVERRIDE: If ANY live web search snippet indicates this person LEFT the target company, JOINED a different company, or was laid off — you MUST set is_valid to false immediately. Profile API data can be stale; live web evidence of departure always wins.
2. Company Intent Signal: Review JOB POSTINGS first — these are the strongest intent signals. If the company has active postings matching our technical keywords, that proves they need our service. Also check company news. If NO intent signal exists from either source, set is_valid to false.
3. Company Fit: Use firmographics to assess fit. Wrong industry or too small = reduce confidence significantly.
4. If company fit is weak AND no intent signals exist, set is_valid to false.
5. NEVER fabricate evidence. If a data source returned no results, say so explicitly.
6. Output ONLY the JSON object below — no markdown fences, no commentary.

You MUST return EXACTLY this JSON structure:
{
  "verified_identity": {
    "first_name": "<First Name>",
    "last_name": "<Last Name>",
    "current_company": "<Exact Current Company Name from profile API>",
    "current_title": "<Exact Current Title from profile API>",
    "company_domain": "<Company website domain from profile API>"
  },
  "market_research_signals": {
    "person_recency_proof": "<Quote a recent web snippet confirming they are still active, OR state 'Profile API confirmed; no contradicting web evidence found.' Do NOT fabricate quotes.>",
    "company_intent_signal": "<Quote the specific job posting title or news event. If none, state 'No recent intent signals found.'>",
    "company_fit_analysis": "<1 sentence on company fit based on firmographics and signals>"
  },
  "validation_telemetry": {
    "layer_confidence": <0-100: 90-100 if profile confirmed + job postings + positive web signals, 70-89 if profile confirmed + one signal, 50-69 if profile confirmed only, 0 if departure detected or no fit>,
    "reasoning": "<1 sentence justifying the score>",
    "is_valid": <true/false — false if departure evidence found, or no company fit/intent>
  }
}`;

/**
 * Layer 3: Deep Researcher & Triangulation Agent
 *
 * HARD GATE: Profile API (Coresignal or NinjaPear) MUST confirm is_current=1
 * at the target company. If neither can confirm, the lead is immediately dropped.
 * No LLM can override missing profile confirmation.
 *
 * After profile confirmation, five parallel data checks run, then the LLM
 * looks for DEPARTURE signals and evaluates company intent/fit.
 */
export class VerifierStage implements PipelineStage<VerifierInput, VerifierOutput> {
  readonly name = 'VERIFIER';

  async execute(input: VerifierInput): Promise<StageResult<VerifierOutput>> {
    const { firstName, lastName } = splitName(input.candidate.raw_name);
    const company = input.candidate.raw_company;
    let apiCost = 0;

    const failResult = (reason: string): StageResult<VerifierOutput> => ({
      output: {
        verified_identity: {
          first_name: firstName,
          last_name: lastName,
          current_company: company,
          current_title: 'Unknown',
          company_domain: '',
        },
        market_research_signals: {
          person_recency_proof: 'N/A — lead failed verification',
          company_intent_signal: 'N/A — lead failed verification',
          company_fit_analysis: 'N/A — lead failed verification',
        },
        validation_telemetry: {
          layer_confidence: 0,
          reasoning: reason,
          is_valid: false,
        },
      },
      telemetry: { layer_confidence: 0, reasoning: reason, is_valid: false },
      apiCost,
    });

    // ═══════════════════════════════════════════════════
    // PHASE 1: MANDATORY PROFILE VERIFICATION (HARD GATE)
    // At least one profile API must confirm is_current=1
    // at the target company. No confirmation = lead dies.
    // ═══════════════════════════════════════════════════

    let confirmedRole: string | null = null;
    let confirmedCompany: string | null = null;
    let confirmedDomain: string | null = null;
    let confirmedHeadline: string | null = null;
    let profileSource = '';
    let activitySummary = '';

    console.log(`[Verifier] Processing candidate: "${firstName} ${lastName}" at "${company}"`);

    // Try Coresignal first (primary)
    if (env.CORESIGNAL_API_KEY) {
      try {
        const employee = await searchEmployee(firstName, lastName, company);
        apiCost += 0.01;
        if (employee) {
          const v = verifyCoresignalEmployment(employee, company);
          if (v.isCurrentlyEmployed) {
            confirmedRole = v.currentRole;
            confirmedCompany = v.currentCompany;
            confirmedDomain = v.companyDomain;
            confirmedHeadline = v.headline;
            profileSource = 'Coresignal';
            activitySummary = formatActivitySummary(employee);
          } else {
            return failResult(`Coresignal: ${v.reason}`);
          }
        }
      } catch (err) {
        console.warn(`[Verifier] Coresignal employee search failed: ${(err as Error).message}`);
      }
    }

    // Try NinjaPear as fallback (only if Coresignal didn't confirm)
    if (!confirmedRole && env.NINJAPEAR_API_KEY) {
      try {
        const domain = companyNameToDomain(company);
        const profile = await getPersonProfile(firstName, lastName, domain);
        apiCost += 0.02;
        if (profile) {
          const v = verifyCurrentEmployment(profile, company);
          if (v.isCurrentlyEmployed) {
            confirmedRole = v.currentRole;
            confirmedCompany = v.currentCompany;
            confirmedDomain = v.companyDomain;
            profileSource = profileSource ? `${profileSource} + NinjaPear` : 'NinjaPear';
          } else {
            return failResult(`NinjaPear: ${v.reason}`);
          }
        }
      } catch (err) {
        console.warn(`[Verifier] NinjaPear fallback failed: ${(err as Error).message}`);
      }
    }

    // ════════════════════════════════════════
    // HARD GATE: No profile confirmation = FAIL
    // ════════════════════════════════════════
    if (!confirmedRole) {
      console.log(`[Verifier] HARD GATE FAIL: "${firstName} ${lastName}" at "${company}" — no profile API confirmed employment`);
      return failResult(
        'Employment not verified: no profile API could confirm current employment at target company. Both Coresignal and NinjaPear returned no matching active profile.',
      );
    }

    console.log(`[Verifier] PROFILE CONFIRMED: "${firstName} ${lastName}" as "${confirmedRole}" at "${confirmedCompany}" via ${profileSource}`);

    const profileSummary = `${profileSource} CONFIRMED: "${confirmedRole}" at "${confirmedCompany}" (domain: ${confirmedDomain ?? 'unknown'}). Headline: "${confirmedHeadline ?? 'N/A'}".${activitySummary}`;

    // ═══════════════════════════════════════════
    // PHASE 2: PARALLEL DATA GATHERING
    // Profile is confirmed. Now gather signals for
    // departure detection, company intent, and fit.
    // ═══════════════════════════════════════════

    const currentYear = new Date().getFullYear();
    const recencyDate = sixMonthsAgo();
    const topKeywords = input.blueprint.technical_keywords.slice(0, 4);

    type JobsResult = CoresignalJob[];
    type CompanyResult = CoresignalCompany | null;
    type ExaResult = { results: ExaSearchResult[] };

    const promises: [
      Promise<JobsResult>,
      Promise<CompanyResult>,
      Promise<ExaResult>,
      Promise<ExaResult>,
    ] = [
      env.CORESIGNAL_API_KEY
        ? searchJobPostings(company, topKeywords).catch((err) => {
            console.warn(`[Verifier] Coresignal jobs search failed: ${(err as Error).message}`);
            return [] as CoresignalJob[];
          })
        : Promise.resolve([] as CoresignalJob[]),

      env.CORESIGNAL_API_KEY && confirmedDomain
        ? enrichCompany(confirmedDomain).catch((err) => {
            console.warn(`[Verifier] Coresignal company enrich failed: ${(err as Error).message}`);
            return null;
          })
        : Promise.resolve(null),

      semanticSearch(
        `"${firstName} ${lastName}" "${company}" ${currentYear}`,
        { numResults: 5, type: 'auto', startPublishedDate: recencyDate },
      ).catch(() => ({ results: [] as ExaSearchResult[] })),

      semanticSearch(
        `"${company}" partnership OR expansion OR acquisition OR "${input.blueprint.industry_vertical?.[0] ?? input.blueprint.specific_pain_points_solved[0]}" ${currentYear}`,
        { numResults: 5, type: 'auto', category: 'news', startPublishedDate: recencyDate },
      ).catch(() => ({ results: [] as ExaSearchResult[] })),
    ];

    const [jobPostings, companyData, personWebResults, companyNewsResults] = await Promise.all(promises);
    apiCost += (env.CORESIGNAL_API_KEY ? 2 : 0) * 0.01 + 2 * 0.007;

    // ═══════════════════════════════════════════
    // PHASE 3: FORMAT DATA FOR LLM
    // ═══════════════════════════════════════════

    const jobPostingsText = jobPostings.length > 0
      ? jobPostings.map((j, i) =>
          `  [${i + 1}] "${j.title}" at ${j.company_name}${j.location ? ` (${j.location})` : ''}${j.created ? ` — Posted: ${j.created}` : ''}${j.description ? `\n      Description: ${j.description.replace(/<[^>]*>/g, '').slice(0, 300)}` : ''}`,
        ).join('\n')
      : '  No active job postings found matching our offering keywords.';

    const companyDataText = companyData
      ? `Company: ${companyData.name ?? company} | Industry: ${companyData.industry ?? 'Unknown'} | Employees: ${companyData.employees_count ?? 'Unknown'} | Founded: ${companyData.founded ?? 'Unknown'} | HQ: ${companyData.headquarters_city ?? ''}, ${companyData.headquarters_country ?? ''} | Specialties: ${companyData.specialties ?? 'Unknown'} | Type: ${companyData.company_type ?? 'Unknown'}`
      : '  Company firmographics not available.';

    const personSnippets = extractExaSnippets(personWebResults);
    const newsSnippets = extractExaSnippets(companyNewsResults);

    const userPrompt = `Evaluate this PROFILE-CONFIRMED lead for departure signals and company fit:

OFFERING BLUEPRINT:
- Name: ${input.blueprint.normalized_offering_name}
- Value Prop: ${input.blueprint.core_value_prop}
- Pain Points: ${input.blueprint.specific_pain_points_solved.join(', ')}
- Technical Keywords: ${input.blueprint.technical_keywords.join(', ')}
- Target Industry: ${input.blueprint.industry_vertical?.join(', ') ?? 'Any'}

CANDIDATE (profile API confirmed):
- Name: ${firstName} ${lastName}
- Verified Title: ${confirmedRole}
- Verified Company: ${confirmedCompany}
- Company Domain: ${confirmedDomain ?? 'unknown'}
- Profile Source: ${profileSource}
- Discovery Evidence: "${input.candidate.evidence_snippet}"
- Discovery Source: ${input.candidate.source_url}

── PROFILE DATA ──
${profileSummary}

── COMPANY FIRMOGRAPHICS ──
${companyDataText}

── ACTIVE JOB POSTINGS at "${company}" matching [${topKeywords.join(', ')}] (${jobPostings.length} found) ──
${jobPostingsText}

── WEB SEARCH: DEPARTURE CHECK (${personSnippets.length} results for "${firstName} ${lastName}" + "${company}" in ${currentYear}) ──
${personSnippets.length > 0
  ? personSnippets.map((s, i) => `  [${i + 1}] "${s.title}" — ${s.url}\n      Snippet: ${s.text}`).join('\n')
  : '  No recent web results found. No departure signals detected, but no positive confirmation either.'}

── WEB SEARCH: COMPANY NEWS (${newsSnippets.length} results) ──
${newsSnippets.length > 0
  ? newsSnippets.map((s, i) => `  [${i + 1}] "${s.title}" — ${s.url}\n      Snippet: ${s.text}`).join('\n')
  : '  No recent company news found.'}

CRITICAL REMINDER: The profile API confirmed this person is currently at ${confirmedCompany}. Check the web search results for ANY sign they recently left. If departure evidence exists, override and set is_valid to false.`;

    // ═══════════════════════════════════════════
    // PHASE 4: LLM TRIANGULATION
    // ═══════════════════════════════════════════

    const router = getLLMRouter();
    const { provider, model, providerName } = router.route('REASONING');

    const output = await provider.generateStructured(
      verifiedIdentitySchema,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model,
    );

    return {
      output,
      telemetry: output.validation_telemetry,
      llmProvider: providerName,
      llmModel: model,
      apiCost,
    };
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

type SearchSnippet = { title: string; url: string; text: string };

function extractExaSnippets(response: { results: ExaSearchResult[] }): SearchSnippet[] {
  return response.results
    .filter((r) => r.title || r.text || (r.highlights && r.highlights.length > 0))
    .map((r) => ({
      title: r.title,
      url: r.url,
      text: (r.highlights?.[0] ?? r.text ?? '').slice(0, 400),
    }));
}

function formatActivitySummary(employee: CoresignalEmployee): string {
  const activity = employee.activity;
  if (!activity || activity.length === 0) return ' No recent profile activity found.';
  const recent = activity.slice(0, 3);
  const items = recent
    .map((a) => `"${a.title?.slice(0, 80) ?? 'Unknown post'}" (${a.action ?? 'activity'})`)
    .join('; ');
  return ` Recent activity: ${items}.`;
}


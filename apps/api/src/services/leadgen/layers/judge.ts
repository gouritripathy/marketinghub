import { z } from 'zod';
import { finalCrmPayloadSchema } from '@marketinghub/shared';
import type { PipelineStage, StageResult } from '../PipelineStage';
import { getLLMRouter } from '../../llm';

export type JudgeInput = {
  blueprintName: string;
  targetRoles: string[];
  candidate: {
    rawName: string;
    rawCompany: string;
    evidenceSnippet: string;
    sourceUrl: string;
    sourceQuality?: string;
  };
  verified: {
    firstName: string;
    lastName: string;
    currentCompany: string;
    currentTitle: string;
    companyDomain: string;
  };
  contact: {
    verifiedEmail: string;
    deliverabilityStatus: string;
  };
  marketResearch?: {
    personRecencyProof: string;
    companyIntentSignal: string;
    companyFitAnalysis: string;
  };
  layerTelemetry: Array<{
    layer: string;
    confidence: number;
    is_valid: boolean;
  }>;
};

export type JudgeOutput = z.infer<typeof finalCrmPayloadSchema>;

const SYSTEM_PROMPT = `You are a ruthless Sales Enablement Manager. You are reviewing the collected telemetry for a single lead across the pipeline layers. Your job is to calculate a final score and write the justification for the sales rep.

Scoring breakdown (100 points total):
- Title Match (20 pts): How closely the verified title matches the target roles.
- Evidence Strength (20 pts): Quality of the evidence snippet — keynote > interview > article > directory.
- Source Recency (10 pts): Prefer sources published within 180 days. Penalize older sources.
- Company Fit & Intent (25 pts): Based on the Deep Researcher's live market signals — active job postings, relevant news, M&A, partnerships proving the company needs our offering RIGHT NOW. No intent signals = max 5 pts.
- Email Quality (10 pts): 10 for verified valid, 0 otherwise.
- Engagement Signals (15 pts): Conference speaker or interviewer gets full points. Recent "Proof of Life" search confirmation adds 5 pts. Passive mentions get fewer.

Rules:
1. If ANY layer's validation shows is_valid: false, the final Lead_Score is 0 and is_valid is false.
2. Draft a crisp, 2-sentence rationale for the sales rep. It MUST include the exact evidence_snippet and mention the source_url. If strong company intent signals were found, mention them.
3. Include the full Score_Breakdown object.
4. Output ONLY the JSON object below — no markdown fences, no commentary.

You MUST return EXACTLY this JSON structure:
{
  "final_crm_payload": {
    "First_Name": "<string>",
    "Last_Name": "<string>",
    "Company": "<string>",
    "Title": "<string>",
    "Email": "<valid email>",
    "Lead_Score": <number 0-100>,
    "Sales_Rationale": "<2-sentence justification quoting the snippet and URL>",
    "Evidence_URL": "<URL>",
    "Score_Breakdown": {
      "title_match": { "points": <number>, "max": 20, "reason": "<string>" },
      "evidence_strength": { "points": <number>, "max": 20, "reason": "<string>" },
      "source_recency": { "points": <number>, "max": 10, "reason": "<string>" },
      "company_fit": { "points": <number>, "max": 25, "reason": "<string>" },
      "email_quality": { "points": <number>, "max": 10, "reason": "<string>" },
      "engagement_signals": { "points": <number>, "max": 15, "reason": "<string>" }
    }
  },
  "validation_telemetry": {
    "layer_confidence": <number matching Lead_Score>,
    "reasoning": "<1 sentence summarizing the audit trail>",
    "is_valid": <true or false>
  }
}`;

export class JudgeStage implements PipelineStage<JudgeInput, JudgeOutput> {
  readonly name = 'JUDGE';

  async execute(input: JudgeInput): Promise<StageResult<JudgeOutput>> {
    const router = getLLMRouter();

    const anyInvalid = input.layerTelemetry.some((t) => !t.is_valid);
    if (anyInvalid) {
      const failedLayer = input.layerTelemetry.find((t) => !t.is_valid);
      return {
        output: {
          final_crm_payload: {
            First_Name: input.verified.firstName,
            Last_Name: input.verified.lastName,
            Company: input.verified.currentCompany,
            Title: input.verified.currentTitle,
            Email: input.contact.verifiedEmail,
            Lead_Score: 0,
            Sales_Rationale: `Lead disqualified: ${failedLayer?.layer} validation failed.`,
            Evidence_URL: input.candidate.sourceUrl,
            Score_Breakdown: {
              title_match: { points: 0, max: 20, reason: 'Disqualified' },
              evidence_strength: { points: 0, max: 20, reason: 'Disqualified' },
              source_recency: { points: 0, max: 10, reason: 'Disqualified' },
              company_fit: { points: 0, max: 25, reason: 'Disqualified' },
              email_quality: { points: 0, max: 10, reason: 'Disqualified' },
              engagement_signals: { points: 0, max: 15, reason: 'Disqualified' },
            },
          },
          validation_telemetry: {
            layer_confidence: 0,
            reasoning: `Disqualified at ${failedLayer?.layer} layer`,
            is_valid: false,
          },
        },
        telemetry: {
          layer_confidence: 0,
          reasoning: `Disqualified at ${failedLayer?.layer} layer`,
          is_valid: false,
        },
      };
    }

    const marketBlock = input.marketResearch
      ? `\nMarket Research (from Deep Researcher):
- Person Recency Proof: "${input.marketResearch.personRecencyProof}"
- Company Intent Signal: "${input.marketResearch.companyIntentSignal}"
- Company Fit Analysis: "${input.marketResearch.companyFitAnalysis}"`
      : '\nMarket Research: Not available';

    const userPrompt = `Evaluate this lead and produce the final CRM payload:

Offering: ${input.blueprintName}
Target Roles: ${input.targetRoles.join(', ')}

Candidate Evidence:
- Source: ${input.candidate.sourceUrl}
- Quality: ${input.candidate.sourceQuality ?? 'UNKNOWN'}
- Snippet: "${input.candidate.evidenceSnippet}"

Verified Identity:
- Name: ${input.verified.firstName} ${input.verified.lastName}
- Title: ${input.verified.currentTitle}
- Company: ${input.verified.currentCompany}
- Domain: ${input.verified.companyDomain}

Contact:
- Email: ${input.contact.verifiedEmail}
- Deliverability: ${input.contact.deliverabilityStatus}
${marketBlock}

Layer Telemetry:
${input.layerTelemetry.map((t) => `- ${t.layer}: confidence=${t.confidence}, valid=${t.is_valid}`).join('\n')}`;

    const { provider, model, providerName } = router.route('GENERATION');
    const output = await provider.generateStructured(
      finalCrmPayloadSchema,
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
    };
  }
}

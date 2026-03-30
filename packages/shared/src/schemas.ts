import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'MEMBER', 'REVIEWER']);
export const agentRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export const agentOutputTypeSchema = z.enum(['DRAFT', 'POST', 'INSIGHT', 'IMAGE_PROMPT']);
export const approvalStageSchema = z.enum(['BRAND', 'LEGAL', 'MANAGER']);
export const approvalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const memoryScopeSchema = z.enum(['USER', 'TEAM', 'GLOBAL']);
export const memoryTypeSchema = z.enum(['VOICE', 'RULE', 'CTA', 'PROOF', 'FAQ', 'PATTERN', 'AVOID']);
export const contentGoalSchema = z.enum([
  'BLOG',
  'LANDING',
  'CASE_STUDY',
  'WHITEPAPER',
  'LINKEDIN',
  'EMAIL',
  'CUSTOM',
]);
export const contentDraftStatusSchema = z.enum(['DRAFTING', 'IN_REVIEW', 'FINAL']);
export const contentDraftVersionStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'FINAL', 'REJECTED']);
export const contentApprovalDecisionSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES']);

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: roleSchema.optional(),
  teamId: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: roleSchema.optional(),
  password: z.string().min(8).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const agentRunSchema = z.object({
  agentKey: z.string().min(1),
  inputText: z.string().min(1),
  context: z.record(z.any()).optional(),
});

export const memoryCreateSchema = z.object({
  scope: memoryScopeSchema,
  type: memoryTypeSchema,
  key: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
  ownerUserId: z.string().uuid().optional(),
  ownerTeamId: z.string().uuid().optional(),
});

// ──────────────────────────────────────────────
// Lead Generation Schemas
// ──────────────────────────────────────────────

export const leadCampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED']);
export const leadPipelineRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const leadLayerNameSchema = z.enum(['CONTEXT_ENGINE', 'STRATEGY_AGENT', 'HUNTER', 'VERIFIER', 'POSTMAN', 'JUDGE']);
export const leadCandidateStatusSchema = z.enum(['DISCOVERED', 'VERIFIED', 'CONTACT_RESOLVED', 'SCORED', 'DROPPED']);
export const creditTxTypeSchema = z.enum(['PURCHASE', 'USAGE', 'REFUND', 'BONUS']);

export const leadCampaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  inputUrl: z.string().url().optional(),
  inputText: z.string().min(10).optional(),
  config: z.object({
    targetGeography: z.array(z.string().min(1)).optional(),
    targetCompanySize: z.string().optional(),
    industryVertical: z.array(z.string().min(1)).optional(),
    maxLeads: z.number().int().min(1).max(500).default(50),
  }).optional(),
}).refine(
  (data) => data.inputUrl || data.inputText,
  { message: 'Either inputUrl or inputText is required' },
);

export const validationTelemetrySchema = z.object({
  layer_confidence: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  is_valid: z.boolean(),
});

export const offeringBlueprintSchema = z.object({
  offering_blueprint: z.object({
    normalized_offering_name: z.string().min(1),
    core_value_prop: z.string().min(1),
    specific_pain_points_solved: z.array(z.string().min(1)).min(1),
    technical_keywords: z.array(z.string().min(1)).min(1),
    anti_personas: z.array(z.string().min(1)),
    anti_companies: z.array(z.string().min(1)).optional(),
    target_geography: z.array(z.string().min(1)).optional(),
    target_company_size: z.string().optional(),
    industry_vertical: z.array(z.string().min(1)).optional(),
  }),
  validation_telemetry: validationTelemetrySchema,
});

export const searchStrategySchema = z.object({
  search_strategy: z.object({
    target_roles: z.array(z.string().min(1)).min(1),
    intent_keywords: z.array(z.string().min(1)).min(1),
    search_queries: z.object({
      semantic: z.array(z.string().min(1)).min(1),
      boolean: z.array(z.string().min(1)).optional(),
    }),
    source_type_priority: z.array(z.string().min(1)).optional(),
  }),
  validation_telemetry: validationTelemetrySchema,
});

export const hunterCandidateSchema = z.object({
  raw_name: z.string().min(1),
  raw_company: z.string().min(1),
  evidence_snippet: z.string().min(1),
  source_url: z.string().url(),
  source_quality: z.enum(['KEYNOTE', 'INTERVIEW', 'ARTICLE', 'PRESS_RELEASE', 'DIRECTORY', 'BLOG_MENTION', 'OTHER']).optional(),
});

export const hunterOutputSchema = z.object({
  candidates: z.array(hunterCandidateSchema),
  validation_telemetry: validationTelemetrySchema,
});

export const marketResearchSignalsSchema = z.object({
  person_recency_proof: z.string().min(1),
  company_intent_signal: z.string().min(1),
  company_fit_analysis: z.string().min(1),
});

export const verifiedIdentitySchema = z.object({
  verified_identity: z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    current_company: z.string().min(1),
    current_title: z.string().min(1),
    company_domain: z.string(),
  }),
  market_research_signals: marketResearchSignalsSchema,
  validation_telemetry: validationTelemetrySchema,
});

export const contactDataSchema = z.object({
  contact_data: z.object({
    verified_email: z.string().email(),
    deliverability_status: z.string().min(1),
  }),
  validation_telemetry: validationTelemetrySchema,
});

const scoreComponentSchema = z.object({
  points: z.number(),
  max: z.number(),
  reason: z.string(),
});

export const leadScoreBreakdownSchema = z.object({
  title_match: scoreComponentSchema,
  evidence_strength: scoreComponentSchema,
  source_recency: scoreComponentSchema,
  company_fit: scoreComponentSchema,
  email_quality: scoreComponentSchema,
  engagement_signals: scoreComponentSchema,
});

export const finalCrmPayloadSchema = z.object({
  final_crm_payload: z.object({
    First_Name: z.string().min(1),
    Last_Name: z.string().min(1),
    Company: z.string().min(1),
    Title: z.string().min(1),
    Email: z.string().email(),
    Lead_Score: z.number().min(0).max(100),
    Sales_Rationale: z.string().min(1),
    Evidence_URL: z.string().url(),
    Score_Breakdown: leadScoreBreakdownSchema,
  }),
  validation_telemetry: validationTelemetrySchema,
});

// ──────────────────────────────────────────────
// Content Pipeline Schemas
// ──────────────────────────────────────────────

export const contentOutputContractSchema = z.object({
  brief: z.object({
    goal: contentGoalSchema,
    persona: z.string().min(1),
    keywords: z.array(z.string().min(1)).default([]),
    outline: z.array(z.string().min(1)).default([]),
  }),
  evidence: z.array(
    z.object({
      citation: z.string().min(1),
      facts: z.array(z.string().min(1)).min(1),
    }),
  ),
  blocks: z.array(
    z.object({
      type: z.string().min(1),
      content: z.string().min(1),
      meta: z.record(z.any()).optional(),
    }),
  ),
  variants: z.array(z.record(z.any())).length(2),
  internal_links: z.array(z.string().min(1)).default([]),
  fact_check_needed: z.array(z.string().min(1)).default([]),
  quality_flags: z.array(z.string().min(1)).default([]),
  pipeline_errors: z.array(z.string().min(1)).default([]).optional(),
  content_meta: z
    .object({
      formatStyle: z.string().min(1).optional(),
      toneProfileUsed: z.string().min(1).optional(),
      patternUsed: z.string().min(1).optional(),
      systemRulesUsed: z.array(z.string().min(1)).optional(),
      memoryIdsUsed: z.array(z.string().min(1)).optional(),
      edit_summary: z.string().min(1).optional(),
    })
    .optional(),
});

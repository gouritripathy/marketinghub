import { z } from 'zod';
import { prisma } from '../db';
import { contentGoalSchema } from '@marketinghub/shared';
import { getLLMProvider } from './llm';
import { LLMUnavailableError } from './llm/LLMProvider';
import { SearchService } from './research/searchService';
import { FetchService, FetchedSource } from './research/fetchService';
import { ExtractService, EvidenceExtraction } from './research/extractService';
import { GuardrailsService } from './guardrailsService';
import { env } from '../config/env';

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const formatStyleByGoal: Record<string, string> = {
  BLOG: 'PAS',
  LANDING: 'AIDA',
  CASE_STUDY: 'Problem-Solution',
  WHITEPAPER: 'Research-Driven',
  LINKEDIN: 'AIDA',
  EMAIL: 'AIDA',
  CUSTOM: 'Problem-Solution',
};

const outlineByGoal: Record<string, Array<{ title: string; intent: string }>> = {
  BLOG: [
    { title: 'Introduction', intent: 'Set context and why this matters.' },
    { title: 'Problem', intent: 'Describe the core problem or opportunity.' },
    { title: 'Solution', intent: 'Explain the approach with evidence.' },
    { title: 'Proof', intent: 'Provide proof points and examples.' },
    { title: 'CTA', intent: 'Invite the reader to take action.' },
  ],
  LANDING: [
    { title: 'Hero', intent: 'State the value proposition clearly.' },
    { title: 'Benefits', intent: 'List key outcomes and value.' },
    { title: 'Proof', intent: 'Include proof points or testimonials.' },
    { title: 'CTA', intent: 'Primary call to action.' },
  ],
  CASE_STUDY: [
    { title: 'Challenge', intent: 'Explain the customer challenge.' },
    { title: 'Approach', intent: 'Describe the solution and process.' },
    { title: 'Results', intent: 'Highlight measurable outcomes.' },
    { title: 'CTA', intent: 'Invite similar prospects to engage.' },
  ],
  WHITEPAPER: [
    { title: 'Executive Summary', intent: 'Summarize the thesis.' },
    { title: 'Background', intent: 'Provide definitions and context.' },
    { title: 'Analysis', intent: 'Present evidence and insights.' },
    { title: 'Recommendations', intent: 'Offer guidance and next steps.' },
  ],
  LINKEDIN: [
    { title: 'Hook', intent: 'Grab attention with a punchy opener.' },
    { title: 'Value', intent: 'Deliver the main insight.' },
    { title: 'CTA', intent: 'Ask for a response or action.' },
  ],
  EMAIL: [
    { title: 'Subject', intent: 'Summarize the main value.' },
    { title: 'Body', intent: 'Explain the offer with evidence.' },
    { title: 'CTA', intent: 'Single clear action.' },
  ],
  CUSTOM: [
    { title: 'Introduction', intent: 'Set context.' },
    { title: 'Key Points', intent: 'Deliver the main points.' },
    { title: 'CTA', intent: 'Invite action.' },
  ],
};

const plannerSchemaHint =
  'Return a JSON object with keys: objective (string), audience (string), angle (string), ' +
  'keyword_plan ({ primary: string[], supporting: string[] }), outline (Array<{ title: string; intent: string }>), ' +
  'evidence_needs (string[]), recommended_format_style (string). Do not wrap in another object.';

const writerSchemaHint =
  'Return a JSON object with keys: blocks (Array<{ type: string; content: string; meta?: object }>), ' +
  'variants (Array<object> length 2), internal_links (string[]), fact_check_needed (string[]), ' +
  'quality_flags (string[]), edit_summary? (string). Do not wrap in another object.';

const editorSchemaHint =
  'Return a JSON object with keys: blocks (Array<{ type: string; content: string; meta?: object }>), ' +
  'variants (Array<object> length 2), edit_summary? (string). Do not wrap in another object.';

const parseLengthRange = (value?: string) => {
  if (!value) return { minWords: undefined, maxWords: undefined };
  const match = value.replace(/,/g, '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return { minWords: undefined, maxWords: undefined };
  const minWords = Number(match[1]);
  const maxWords = Number(match[2]);
  return {
    minWords: Number.isFinite(minWords) ? minWords : undefined,
    maxWords: Number.isFinite(maxWords) ? maxWords : undefined,
  };
};

const buildWriterPrompt = (params: {
  outlineTitles: string[];
  targetLength?: string;
  input: IntakeInput;
  brief: z.infer<typeof briefSchema>;
  evidence: EvidenceExtraction;
  memory: {
    voice: string[];
    rules: string[];
    ctas: string[];
    proof: string[];
    faqs: string[];
    avoid: string[];
  };
  patterns: Array<{ id?: string }>;
}) => {
  const allowedTypes = params.outlineTitles.length > 0 ? params.outlineTitles.join(', ') : 'use the outline titles';
  return (
    'You are a senior content strategist and AI engineer. Generate final copy blocks and variants.\n' +
    'Write in a confident, executive tone aligned to the persona. Sound like a seasoned marketer.\n' +
    `Primary topic: ${params.input.topic}.\n` +
    'Required keywords must be woven naturally without changing the primary topic or scope.\n' +
    'When the topic mentions AI-era selection, include AI-specific depth such as scenario modeling, risk detection,\n' +
    'benefits realization forecasting, demand vs capacity balancing, portfolio trade-off analysis, and copilot-style decision support.\n' +
    'Use concrete examples or short scenarios to make concepts credible without inventing data.\n' +
    'Use the brief outline to create the structure: one block per outline item, in order.\n' +
    'Set block.type to the exact outline title. Do not invent new block types like "paragraph".\n' +
    `Allowed block types: ${allowedTypes}.\n` +
    'Each block.content must be publish-ready copy with clear subheadings, short paragraphs, and occasional bullets.\n' +
    'Use evidence facts where available. Do not invent statistics or sources.\n' +
    'If evidence is empty, keep the Proof section qualitative (no numbers, no citations).\n' +
    'If a claim is unsupported, avoid it or add it to fact_check_needed.\n' +
    'If evidence is thin, write qualitative analysis and list evidence gaps in fact_check_needed.\n' +
    'Never use bracketed placeholders like [Source], [Statistic], [Tool].\n' +
    'Ensure all required keywords appear verbatim at least once.\n' +
    'Include exactly one CTA block at the end, even if the outline omitted it.\n' +
    'Return JSON only matching the schema fields.\n' +
    `Target length: ${params.targetLength ?? 'use your best judgment'}.\n` +
    `${writerSchemaHint}\n` +
    JSON.stringify(
      {
        input: params.input,
        brief: params.brief,
        evidence: params.evidence,
        memory: params.memory,
        patterns: params.patterns,
      },
      null,
      2,
    )
  );
};

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const maybeExpandBlocks = async (params: {
  blocks: Array<{ type: string; content: string; meta?: object }>;
  variants: Array<Record<string, unknown>>;
  minWords?: number;
  maxWords?: number;
  input: IntakeInput;
  evidence: EvidenceExtraction;
  outlineTitles: string[];
}) => {
  if (!params.minWords) return null;
  const initialCount = countWords(params.blocks.map((block) => block.content).join(' '));
  if (initialCount >= params.minWords) return null;

  const provider = getLLMProvider();
  const model = getModelForStep('writer');
  if (!model) throw new LLMUnavailableError('Writer model not configured');

  const minPerBlock = Math.max(140, Math.floor(params.minWords / Math.max(params.blocks.length, 1)));
  let blocks = params.blocks;
  let variants = params.variants;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let expanded: z.infer<typeof editorResponseSchema>;
    try {
      expanded = await provider.generateStructured(editorResponseSchema, [
        {
          role: 'user',
          content:
            'You are a senior editor. Expand the content to meet the target length without adding new block types.\n' +
            'Keep block.type values and order unchanged. Keep exactly one CTA block at the end.\n' +
            'Do not invent statistics or citations. Avoid bracketed placeholders like [Source] or [Statistic].\n' +
            'If the topic is AI-era selection, add depth: scenario modeling, risk detection, benefits realization,\n' +
            'demand vs capacity balancing, portfolio trade-off analysis, and copilot-style decision support.\n' +
            `Each block must be at least ${minPerBlock} words and include 2-3 paragraphs.\n` +
            'Use concrete examples or brief scenarios where helpful.\n' +
            `Target length: ${params.minWords}${params.maxWords ? `-${params.maxWords}` : '+'} words.\n` +
            'Return JSON only matching the schema fields.\n' +
            `${editorSchemaHint}\n` +
            JSON.stringify(
              {
                input: params.input,
                outlineTitles: params.outlineTitles,
                evidence: params.evidence,
                existing: { blocks, variants },
              },
              null,
              2,
            ),
        },
      ], model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('rate limit')) {
        await sleep(14000);
        continue;
      }
      throw error;
    }

    blocks = expanded.blocks;
    variants = expanded.variants;
    const expandedCount = countWords(blocks.map((block) => block.content).join(' '));
    if (expandedCount >= params.minWords) {
      return expanded;
    }
  }

  return { blocks, variants };
};

const getModelForStep = (step: 'planner' | 'extractor' | 'writer' | 'editor') => {
  if (env.LLM_PROVIDER === 'GROQ') {
    if (step === 'planner') return env.GROQ_MODEL_PLANNER ?? '';
    if (step === 'extractor') return env.GROQ_MODEL_EXTRACTOR ?? '';
    if (step === 'writer') return env.GROQ_MODEL_WRITER ?? '';
    return env.GROQ_MODEL_EDITOR ?? '';
  }

  if (env.LLM_PROVIDER === 'OLLAMA') {
    if (step === 'planner') return env.OLLAMA_MODEL_PLANNER ?? '';
    if (step === 'extractor') return env.OLLAMA_MODEL_EXTRACTOR ?? '';
    if (step === 'writer') return env.OLLAMA_MODEL_WRITER ?? '';
    return env.OLLAMA_MODEL_EDITOR ?? '';
  }

  return '';
};

const briefSchema = z.object({
  objective: z.string().min(1),
  audience: z.string().min(1),
  angle: z.string().min(1),
  keyword_plan: z.object({
    primary: z.array(z.string().min(1)).default([]),
    supporting: z.array(z.string().min(1)).default([]),
  }),
  outline: z.array(
    z.object({
      title: z.string().min(1),
      intent: z.string().min(1),
    }),
  ),
  evidence_needs: z.array(z.string().min(1)).default([]),
  recommended_format_style: z.string().min(1),
});

const blockSchema = z.object({
  type: z.string().min(1),
  content: z.string().min(1),
  meta: z.record(z.any()).optional(),
});

const writerResponseSchema = z.object({
  blocks: z.array(blockSchema).min(1),
  variants: z.array(z.record(z.any())).length(2),
  internal_links: z.array(z.string().min(1)).default([]),
  fact_check_needed: z.array(z.string().min(1)).default([]),
  quality_flags: z.array(z.string().min(1)).default([]),
  edit_summary: z.string().min(1).optional(),
});

const editorResponseSchema = z.object({
  blocks: z.array(blockSchema).min(1),
  variants: z.array(z.record(z.any())).length(2),
  edit_summary: z.string().min(1).optional(),
});

type IntakeInput = {
  userId: string;
  contentGoal: z.infer<typeof contentGoalSchema>;
  topic: string;
  persona: string;
  tone?: string;
  requiredKeywords?: string[];
  region?: string;
  length?: string;
  internalContext?: string[];
  outputPreference?: string;
};

type PipelineOptions = {
  enableWeb?: boolean;
  internalSources?: Array<{ title: string; url?: string; text: string }>;
  steps?: string[];
};

const buildClarifications = (input: IntakeInput) => {
  const missing: string[] = [];
  if (!input.tone) missing.push('tone');
  if (!input.requiredKeywords || input.requiredKeywords.length === 0) missing.push('requiredKeywords');
  if (!input.region) missing.push('region');
  if (!input.length) missing.push('length');
  return missing;
};

const buildFallbackBrief = (input: IntakeInput) => {
  const topicLower = input.topic.toLowerCase();
  const needsSelectionOutline =
    input.contentGoal === 'BLOG' &&
    (topicLower.includes('selection') || topicLower.includes('tool') || topicLower.includes('ppm'));
  const outline = needsSelectionOutline
    ? [
        { title: 'Introduction', intent: 'Set context for AI-era portfolio decisions.' },
        { title: 'Why Selection Matters', intent: 'Explain the business impact of choosing the right tool.' },
        { title: 'Selection Criteria', intent: 'List the must-have capabilities and evaluation factors.' },
        { title: 'AI Era Capabilities', intent: 'Describe AI-driven features for prioritization and forecasting.' },
        { title: 'Evaluation Checklist', intent: 'Provide a practical checklist for teams.' },
        { title: 'Implementation Considerations', intent: 'Cover rollout, adoption, and change management.' },
        { title: 'CTA', intent: 'Invite the reader to take action.' },
      ]
    : outlineByGoal[input.contentGoal] ?? outlineByGoal.CUSTOM;
  return {
    objective: `Create ${input.contentGoal.toLowerCase()} content about ${input.topic}.`,
    audience: input.persona,
    angle: `Position ${input.topic} for ${input.persona} with clear, evidence-backed messaging.`,
    keyword_plan: {
      primary: input.requiredKeywords ?? [input.topic],
      supporting: [],
    },
    outline,
    evidence_needs: [
      `Definition or background for ${input.topic}`,
      'Relevant statistics or benchmarks',
      'Examples or proof points',
    ],
    recommended_format_style: formatStyleByGoal[input.contentGoal] ?? 'Problem-Solution',
  };
};

const buildResearchPlan = (input: IntakeInput, brief: z.infer<typeof briefSchema>) => {
  const primary = brief.keyword_plan.primary.length > 0 ? brief.keyword_plan.primary : [input.topic];
  const region = input.region ? ` ${input.region}` : '';
  const queries = primary.flatMap((keyword) => [
    `${keyword}${region} statistics`,
    `${keyword}${region} best practices`,
    `${keyword}${region} definition`,
  ]);
  return {
    queries: Array.from(new Set(queries)).slice(0, 8),
    trusted_domains: [],
    internal_sources: input.internalContext ?? [],
  };
};

const buildEvidenceSummary = (evidence: EvidenceExtraction) => {
  return evidence.extracted_facts.slice(0, 5);
};

const buildBlocks = (
  input: IntakeInput,
  brief: z.infer<typeof briefSchema>,
  evidence: EvidenceExtraction,
  ctas: string[],
  faqs: string[],
) => {
  const evidenceHints = buildEvidenceSummary(evidence);
  const outline = brief.outline.length > 0 ? brief.outline : outlineByGoal[input.contentGoal] ?? [];
  const blocks = outline.map((item) => ({
    type: item.title,
    content:
      `${item.title}\n${item.intent}\n` +
      (evidenceHints.length > 0
        ? `Evidence: ${evidenceHints.join('; ')}`
        : 'Evidence: Add verified facts or proof points.'),
    meta: { intent: item.intent },
  }));

  if (!blocks.some((block) => block.type.toLowerCase() === 'cta')) {
    const cta = ctas[0] ?? 'Add a clear call to action.';
    blocks.push({ type: 'CTA', content: cta, meta: { intent: 'Invite action.' } });
  }

  if (faqs.length > 0) {
    blocks.push({ type: 'FAQ', content: faqs.slice(0, 3).join('\n'), meta: { intent: 'Address FAQs.' } });
  }

  return blocks;
};

const buildHumanReadable = (blocks: Array<{ type: string; content: string }>) =>
  blocks.map((block) => `${block.type}\n${block.content}`).join('\n\n');

const normalizeCtaBlocks = (blocks: Array<{ type: string; content: string; meta?: object }>) => {
  const seenCta = new Set<string>();
  const normalized = blocks.filter((block) => {
    if (block.type.toLowerCase() !== 'cta') return true;
    if (seenCta.has('cta')) return false;
    seenCta.add('cta');
    return true;
  });
  return {
    blocks: normalized,
    removedCount: blocks.length - normalized.length,
  };
};

const findMemoryByType = (items: Array<{ type: string; content: string }>, type: string) =>
  items.filter((item) => item.type === type).map((item) => item.content);

const asEvidenceArray = (evidence: EvidenceExtraction) => {
  if (evidence.extracted_facts.length === 0) return [];
  return [
    {
      citation: evidence.sources[0]?.url ?? 'internal',
      facts: evidence.extracted_facts,
    },
  ];
};

const normalizeEvidence = (value: unknown): EvidenceExtraction => {
  const record = toRecord(value);
  return {
    sources: Array.isArray(record.sources) ? (record.sources as EvidenceExtraction['sources']) : [],
    extracted_facts: Array.isArray(record.extracted_facts) ? (record.extracted_facts as string[]) : [],
    supporting_snippets: Array.isArray(record.supporting_snippets)
      ? (record.supporting_snippets as string[])
      : [],
    stats: Array.isArray(record.stats) ? (record.stats as string[]) : [],
    risks: Array.isArray(record.risks) ? (record.risks as string[]) : [],
    claim_gaps: Array.isArray(record.claim_gaps) ? (record.claim_gaps as string[]) : [],
  };
};

export const ContentPipelineService = {
  async intake(input: IntakeInput) {
    const clarifications = buildClarifications(input);
    const inputSnapshot = {
      contentGoal: input.contentGoal,
      topic: input.topic,
      persona: input.persona,
      constraints: {
        tone: input.tone ?? null,
        requiredKeywords: input.requiredKeywords ?? [],
        region: input.region ?? null,
        length: input.length ?? null,
      },
      internalContext: input.internalContext ?? [],
      outputPreference: input.outputPreference ?? 'AUTO',
      clarificationNeeded: clarifications,
    };

    const draft = await prisma.contentDraft.create({
      data: {
        createdByUserId: input.userId,
        contentGoal: input.contentGoal,
        topic: input.topic,
        persona: input.persona,
        status: 'DRAFTING',
        versions: {
          create: {
            versionNumber: 1,
            inputSnapshotJson: inputSnapshot,
            briefJson: {},
            evidenceJson: {},
            outputJson: {},
            humanReadable: '',
            status: 'DRAFT',
          },
        },
      },
      include: {
        versions: {
          select: { id: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return {
      draftId: draft.id,
      versionId: draft.versions[0]?.id ?? '',
      clarificationNeeded: clarifications,
    };
  },

  async runPipeline(versionId: string, teamId: string, options: PipelineOptions = {}) {
    const version = await prisma.contentDraftVersion.findFirst({
      where: { id: versionId, draft: { createdByUser: { teamId } } },
      include: { draft: true },
    });

    if (!version) return null;

    const pipelineErrors: string[] = [];
    const inputSnapshot = toRecord(version.inputSnapshotJson);
    const constraints = toRecord(inputSnapshot.constraints);
    const input: IntakeInput = {
      userId: version.draft.createdByUserId,
      contentGoal: version.draft.contentGoal,
      topic: version.draft.topic,
      persona: version.draft.persona,
      tone: typeof constraints.tone === 'string' ? constraints.tone : undefined,
      requiredKeywords: Array.isArray(constraints.requiredKeywords)
        ? (constraints.requiredKeywords as string[])
        : undefined,
      region: typeof constraints.region === 'string' ? constraints.region : undefined,
      length: typeof constraints.length === 'string' ? constraints.length : undefined,
      internalContext: Array.isArray(inputSnapshot.internalContext)
        ? (inputSnapshot.internalContext as string[])
        : undefined,
      outputPreference:
        typeof inputSnapshot.outputPreference === 'string' ? inputSnapshot.outputPreference : undefined,
    };

    const steps = new Set(options.steps ?? [
      'memory',
      'brief',
      'researchPlan',
      'research',
      'extract',
      'write',
      'guardrails',
    ]);

    const memoryItems = steps.has('memory')
      ? await prisma.memoryItem.findMany({
          where: { ownerTeamId: teamId, scope: 'TEAM' },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const promptPatterns = steps.has('memory')
      ? await prisma.promptPattern.findMany({
          where: { contentGoal: version.draft.contentGoal, persona: version.draft.persona },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        })
      : [];

    if (steps.has('memory')) {
      const updatedSnapshot = {
        ...inputSnapshot,
        memoryIdsUsed: memoryItems.map((item) => item.id),
        patternIdsUsed: promptPatterns.map((item) => item.id),
      };
      await prisma.contentDraftVersion.update({
        where: { id: versionId },
        data: { inputSnapshotJson: updatedSnapshot },
      });
    }

    let brief = steps.has('brief')
      ? buildFallbackBrief(input)
      : (version.briefJson as z.infer<typeof briefSchema>);
    if (steps.has('brief')) {
      try {
        const provider = getLLMProvider();
        const model = getModelForStep('planner');
        if (!model) throw new LLMUnavailableError('Planner model not configured');

        brief = (await provider.generateStructured(briefSchema, [
          {
            role: 'user',
            content:
              'Create a content brief in JSON using the inputs.\n' +
              `${plannerSchemaHint}\n` +
              JSON.stringify({ input, memory: memoryItems, patterns: promptPatterns }, null, 2),
          },
        ], model)) as z.infer<typeof briefSchema>;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`planner_failed:${message}`);
        brief = buildFallbackBrief(input);
      }

      await prisma.contentDraftVersion.update({
        where: { id: versionId },
        data: { briefJson: brief },
      });
    }

    const researchPlan = steps.has('researchPlan')
      ? buildResearchPlan(input, brief as z.infer<typeof briefSchema>)
      : null;

    const internalSources = (options.internalSources ?? []).map((source) => ({
      url: source.url ?? 'internal',
      title: source.title,
      cleanText: source.text,
    }));

    let fetchedSources: FetchedSource[] = [];
    if (steps.has('research') && options.enableWeb && researchPlan) {
      for (const query of researchPlan.queries) {
        const results = await SearchService.search(query, 5);
        for (const result of results) {
          const fetched = await FetchService.fetchUrl(result.url);
          if (fetched) fetchedSources.push(fetched);
        }
      }
      fetchedSources = fetchedSources.slice(0, 10);
    }

    let evidence = normalizeEvidence(version.evidenceJson);
    if (steps.has('extract')) {
      try {
        evidence = await ExtractService.extractEvidence(
          [...internalSources, ...fetchedSources].map((source) => ({
            url: source.url,
            title: source.title,
            cleanText: source.cleanText,
          })),
          (brief as z.infer<typeof briefSchema>).evidence_needs ?? [],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`extract_failed:${message}`);
        evidence = {
          sources: [],
          extracted_facts: [],
          supporting_snippets: [],
          stats: [],
          risks: [],
          claim_gaps: ['Evidence extraction failed.'],
        };
      }
    }

    if (steps.has('extract')) {
      const evidenceJson = {
        ...evidence,
        sources: evidence.sources,
        researchPlan,
      };
      await prisma.contentDraftVersion.update({
        where: { id: versionId },
        data: { evidenceJson },
      });
    }

    const ctas = findMemoryByType(memoryItems, 'CTA');
    const faqs = findMemoryByType(memoryItems, 'FAQ');
    const rules = findMemoryByType(memoryItems, 'RULE');
    const avoid = findMemoryByType(memoryItems, 'AVOID');
    const outlineTitles =
      (brief as z.infer<typeof briefSchema>).outline?.map((item) => item.title) ?? [];
    const targetLength = input.length ?? (input.contentGoal === 'BLOG' ? '2000-3000 words' : undefined);
    const { minWords, maxWords } = parseLengthRange(targetLength);

    let writerResponse: z.infer<typeof writerResponseSchema> | null = null;
    if (steps.has('write')) {
      try {
        const provider = getLLMProvider();
        const model = getModelForStep('writer');
        if (!model) throw new LLMUnavailableError('Writer model not configured');
        writerResponse = (await provider.generateStructured(writerResponseSchema, [
          {
            role: 'user',
            content: buildWriterPrompt({
              outlineTitles,
              targetLength,
              input,
              brief: brief as z.infer<typeof briefSchema>,
              evidence,
              memory: {
                voice: findMemoryByType(memoryItems, 'VOICE'),
                rules,
                ctas,
                proof: findMemoryByType(memoryItems, 'PROOF'),
                faqs,
                avoid,
              },
              patterns: promptPatterns,
            }),
          },
        ], model)) as z.infer<typeof writerResponseSchema>;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`writer_failed:${message}`);
        writerResponse = null;
      }
    }

    const fallbackBlocks = buildBlocks(input, brief as z.infer<typeof briefSchema>, evidence, ctas, faqs);
    const ctaNormalized = normalizeCtaBlocks(writerResponse?.blocks ?? fallbackBlocks);
    const blocks = ctaNormalized.blocks;
    const variants =
      writerResponse?.variants ?? [
        { hook: blocks[0]?.content ?? '' },
        { cta: ctas[0] ?? 'Add a CTA.' },
      ];

    const outputJson = {
      brief: {
        goal: version.draft.contentGoal,
        persona: version.draft.persona,
        keywords: input.requiredKeywords ?? [],
        outline: (brief as z.infer<typeof briefSchema>).outline?.map((item) => item.title) ?? [],
      },
      evidence: asEvidenceArray(evidence),
      blocks,
      variants,
      internal_links: writerResponse?.internal_links ?? [],
      fact_check_needed: [
        ...(writerResponse?.fact_check_needed ?? []),
        ...(evidence.claim_gaps ?? []),
      ],
      quality_flags: [
        ...(writerResponse?.quality_flags ?? []),
        ...(ctaNormalized.removedCount > 0 ? [`duplicate_section:CTA:${ctaNormalized.removedCount + 1}`] : []),
      ],
      content_meta: {
        formatStyle: (brief as z.infer<typeof briefSchema>).recommended_format_style,
        toneProfileUsed: input.tone,
        patternUsed: promptPatterns[0]?.id,
        systemRulesUsed: rules,
        memoryIdsUsed: memoryItems.map((item) => item.id),
        edit_summary: writerResponse?.edit_summary,
      },
      pipeline_errors: pipelineErrors,
    };

    if (steps.has('editor')) {
      try {
        const provider = getLLMProvider();
        const model = getModelForStep('editor');
        if (!model) throw new LLMUnavailableError('Editor model not configured');
        const editorResponse = await provider.generateStructured(editorResponseSchema, [
          {
            role: 'user',
            content:
              'You are a copy editor. Refine the blocks for clarity and tone.\n' +
              'Do not add new facts or claims. Preserve evidence requirements.\n' +
              'Do not change block.type values or block order.\n' +
              'Return JSON only matching the schema fields.\n' +
              `${editorSchemaHint}\n` +
              JSON.stringify({ outputJson, brief, evidence, rules, avoid }, null, 2),
          },
        ], model);
        outputJson.blocks = editorResponse.blocks;
        outputJson.variants = editorResponse.variants;
        if (editorResponse.edit_summary) {
          outputJson.content_meta = {
            ...outputJson.content_meta,
            edit_summary: editorResponse.edit_summary,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`editor_failed:${message}`);
      }
    }

    if (minWords) {
      try {
        const expanded = await maybeExpandBlocks({
          blocks: outputJson.blocks,
          variants: outputJson.variants,
          minWords,
          maxWords,
          input,
          evidence,
          outlineTitles,
        });
        if (expanded) {
          const expandedNormalized = normalizeCtaBlocks(expanded.blocks);
          outputJson.blocks = expandedNormalized.blocks;
          outputJson.variants = expanded.variants;
          if (expandedNormalized.removedCount > 0) {
            outputJson.quality_flags.push(
              `duplicate_section:CTA:${expandedNormalized.removedCount + 1}`,
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`expand_failed:${message}`);
      }
    }

    if (steps.has('guardrails')) {
      const allowedHosts = (env.INTERNAL_LINK_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);
      const guardrailFlags = GuardrailsService.run({
        contentText: outputJson.blocks.map((block) => block.content).join('\n\n'),
        topic: input.topic,
        requiredKeywords: input.requiredKeywords ?? [],
        allowedHosts,
        forbiddenPhrases: [...rules, ...avoid],
        requiredBlockTypes: version.draft.contentGoal === 'LANDING' ? ['CTA', 'Proof'] : ['CTA'],
        blockTypesPresent: outputJson.blocks.map((block) => block.type),
        minWords,
        maxWords,
        maxCtaBlocks: 1,
        placeholderPattern: /\[[^\]]+\]/g,
      });
      outputJson.quality_flags.push(...guardrailFlags);
    }

    if (minWords) {
      const wordCount = countWords(outputJson.blocks.map((block) => block.content).join(' '));
      if (wordCount < minWords) {
        pipelineErrors.push(`length_not_met:${wordCount}`);
      }
    }

    if (steps.has('write') || steps.has('editor') || steps.has('guardrails')) {
      await prisma.contentDraftVersion.update({
        where: { id: versionId },
        data: { outputJson, humanReadable: buildHumanReadable(outputJson.blocks) },
      });
    }

    return {
      versionId,
      brief,
      evidence,
      outputJson,
    };
  },

  async quickGenerate(input: {
    prompt: string;
    contentGoal: z.infer<typeof contentGoalSchema>;
    persona: string;
    tone?: string;
    requiredKeywords?: string[];
    region?: string;
    length?: string;
  }) {
    const pipelineErrors: string[] = [];
    const intakeInput: IntakeInput = {
      userId: 'quick',
      contentGoal: input.contentGoal,
      topic: input.prompt,
      persona: input.persona,
      tone: input.tone,
      requiredKeywords: input.requiredKeywords,
      region: input.region,
      length: input.length,
      internalContext: [],
      outputPreference: 'QUICK',
    };
    const brief = buildFallbackBrief(intakeInput) as z.infer<typeof briefSchema>;
    const outline = brief.outline ?? [];
    const outlineTitles = outline.map((item) => item.title);
    const targetLength =
      input.length ?? (input.contentGoal === 'BLOG' ? '1200-1800 words' : undefined);
    const { minWords, maxWords } = parseLengthRange(targetLength);
    const evidence: EvidenceExtraction = {
      sources: [],
      extracted_facts: [],
      supporting_snippets: [],
      stats: [],
      risks: [],
      claim_gaps: [],
    };

    let writerResponse: z.infer<typeof writerResponseSchema> | null = null;
    try {
      const provider = getLLMProvider();
      const model = getModelForStep('writer');
      if (!model) throw new LLMUnavailableError('Writer model not configured');
      writerResponse = (await provider.generateStructured(writerResponseSchema, [
        {
          role: 'user',
          content: buildWriterPrompt({
            outlineTitles,
            targetLength,
            input: intakeInput,
            brief,
            evidence,
            memory: {
              voice: [],
              rules: [],
              ctas: [],
              proof: [],
              faqs: [],
              avoid: [],
            },
            patterns: [],
          }),
        },
      ], model)) as z.infer<typeof writerResponseSchema>;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      pipelineErrors.push(`writer_failed:${message}`);
      writerResponse = null;
    }

    const fallbackBlocks = buildBlocks(intakeInput, brief, evidence, [], []);
    const ctaNormalized = normalizeCtaBlocks(writerResponse?.blocks ?? fallbackBlocks);
    let blocks = ctaNormalized.blocks;
    let variants =
      writerResponse?.variants ?? [
        { hook: blocks[0]?.content ?? '' },
        { cta: 'Add a CTA.' },
      ];

    if (minWords) {
      try {
        const expanded = await maybeExpandBlocks({
          blocks,
          variants,
          minWords,
          maxWords,
          input: intakeInput,
          evidence,
          outlineTitles,
        });
        if (expanded) {
          const expandedNormalized = normalizeCtaBlocks(expanded.blocks);
          blocks = expandedNormalized.blocks;
          variants = expanded.variants;
          if (expandedNormalized.removedCount > 0) {
            ctaNormalized.removedCount += expandedNormalized.removedCount;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        pipelineErrors.push(`expand_failed:${message}`);
      }
    }

    const wordCount = countWords(blocks.map((block) => block.content).join(' '));
    const lengthFlags: string[] = [];
    if (minWords && wordCount < minWords) lengthFlags.push(`length_short:${wordCount}`);
    if (maxWords && wordCount > maxWords) lengthFlags.push(`length_long:${wordCount}`);
    if (minWords && wordCount < minWords) {
      pipelineErrors.push(`length_not_met:${wordCount}`);
    }

    return {
      brief: {
        goal: input.contentGoal,
        persona: input.persona,
        keywords: input.requiredKeywords ?? [],
        outline: outline.map((item) => item.title),
      },
      evidence: [],
      blocks,
      variants,
      internal_links: writerResponse?.internal_links ?? [],
      fact_check_needed: writerResponse?.fact_check_needed ?? [],
      quality_flags: [
        ...(writerResponse?.quality_flags ?? []),
        ...lengthFlags,
        ...(ctaNormalized.removedCount > 0 ? [`duplicate_section:CTA:${ctaNormalized.removedCount + 1}`] : []),
      ],
      content_meta: {
        formatStyle: brief.recommended_format_style,
        toneProfileUsed: input.tone,
        patternUsed: undefined,
        systemRulesUsed: [],
        memoryIdsUsed: [],
        edit_summary: writerResponse?.edit_summary,
      },
      pipeline_errors: pipelineErrors,
    };
  },

  async quickGenerateText(input: {
    prompt: string;
    contentGoal: z.infer<typeof contentGoalSchema>;
    persona: string;
    tone?: string;
    requiredKeywords?: string[];
    region?: string;
    length?: string;
  }) {
    const intakeInput: IntakeInput = {
      userId: 'quick',
      contentGoal: input.contentGoal,
      topic: input.prompt,
      persona: input.persona,
      tone: input.tone,
      requiredKeywords: input.requiredKeywords,
      region: input.region,
      length: input.length,
      internalContext: [],
      outputPreference: 'RAW_TEXT',
    };
    const brief = buildFallbackBrief(intakeInput) as z.infer<typeof briefSchema>;
    const outline = brief.outline ?? [];
    const outlineTitles = outline.map((item) => item.title);
    const targetLength =
      input.length ?? (input.contentGoal === 'BLOG' ? '1200-1800 words' : undefined);
    const evidence: EvidenceExtraction = {
      sources: [],
      extracted_facts: [],
      supporting_snippets: [],
      stats: [],
      risks: [],
      claim_gaps: [],
    };

    const provider = getLLMProvider();
    const model = getModelForStep('writer');
    if (!model) throw new LLMUnavailableError('Writer model not configured');

    const text = await provider.generateText(
      [
        {
          role: 'user',
          content: buildWriterPrompt({
            outlineTitles,
            targetLength,
            input: intakeInput,
            brief,
            evidence,
            memory: {
              voice: [],
              rules: [],
              ctas: [],
              proof: [],
              faqs: [],
              avoid: [],
            },
            patterns: [],
          }),
        },
      ],
      model,
    );

    return {
      text,
      model,
    };
  },
};

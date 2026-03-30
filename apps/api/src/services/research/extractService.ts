import { z } from 'zod';
import { getLLMProvider } from '../llm';
import { LLMUnavailableError } from '../llm/LLMProvider';
import { env } from '../../config/env';

type EvidenceSource = {
  url: string;
  title: string;
  cleanText: string;
};

export type EvidenceExtraction = {
  sources: Array<{ url: string; title: string }>;
  extracted_facts: string[];
  supporting_snippets: string[];
  stats: string[];
  risks: string[];
  claim_gaps: string[];
};

const evidenceSchema = z.object({
  extracted_facts: z.array(z.string().min(1)).default([]),
  supporting_snippets: z.array(z.string().min(1)).default([]),
  stats: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
  claim_gaps: z.array(z.string().min(1)).default([]),
});

const buildFallbackEvidence = (
  sources: EvidenceSource[],
  claimGaps: string[],
  riskMessage: string,
): EvidenceExtraction => {
  const snippets = sources
    .map((source) => source.cleanText.slice(0, 280))
    .filter((text) => text.length > 0);

  return {
    sources: sources.map((source) => ({ url: source.url, title: source.title })),
    extracted_facts: [],
    supporting_snippets: snippets.slice(0, 6),
    stats: [],
    risks: [riskMessage],
    claim_gaps: claimGaps,
  };
};

export const ExtractService = {
  async extractEvidence(
    sources: EvidenceSource[],
    claimGaps: string[],
  ): Promise<EvidenceExtraction> {
    if (sources.length === 0) {
      return {
        sources: [],
        extracted_facts: [],
        supporting_snippets: [],
        stats: [],
        risks: ['No sources were available to extract evidence.'],
        claim_gaps: claimGaps,
      };
    }

    try {
      const provider = getLLMProvider();
      const model =
        env.LLM_PROVIDER === 'GROQ'
          ? env.GROQ_MODEL_EXTRACTOR ?? env.GROQ_MODEL_PLANNER ?? ''
          : env.OLLAMA_MODEL_EXTRACTOR ?? env.OLLAMA_MODEL_PLANNER ?? '';
      if (!model) throw new LLMUnavailableError('Extractor model not configured');

      const content = sources
        .map((source) => `Source: ${source.title}\nURL: ${source.url}\n${source.cleanText}`)
        .join('\n\n');

      const result = await provider.generateStructured(evidenceSchema, [
        {
          role: 'user',
          content:
            'Extract usable facts, stats, and short snippets. Avoid unsupported claims.\n' +
            `Claim gaps: ${claimGaps.join('; ') || 'none'}\n` +
            content.slice(0, 6000),
        },
      ], model);

      return {
        sources: sources.map((source) => ({ url: source.url, title: source.title })),
        extracted_facts: result.extracted_facts ?? [],
        supporting_snippets: result.supporting_snippets ?? [],
        stats: result.stats ?? [],
        risks: result.risks ?? [],
        claim_gaps: result.claim_gaps ?? [],
      };
    } catch (error) {
      if (error instanceof LLMUnavailableError) {
        return buildFallbackEvidence(sources, claimGaps, error.message);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return buildFallbackEvidence(
        sources,
        claimGaps,
        `Evidence extraction failed; using fallback snippets (${message}).`,
      );
    }
  },
};

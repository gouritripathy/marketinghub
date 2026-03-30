import { z } from 'zod';
import { hunterOutputSchema } from '@marketinghub/shared';
import type { PipelineStage, StageResult } from '../PipelineStage';
import { getLLMRouter } from '../../llm';
import {
  batchSemanticSearch,
  peopleSearch,
  type ExaSearchResult,
} from '../external/exaSearch';
import type { StrategyAgentOutput } from './strategyAgent';

export type HunterInput = {
  strategy: StrategyAgentOutput;
};

export type HunterOutput = z.infer<typeof hunterOutputSchema>;

const SYSTEM_PROMPT = `You are an elite Open-Source Intelligence (OSINT) Researcher. You have been provided with raw web search results. Your job is to extract human targets who match the buyer persona.

Rules:
1. ZERO HALLUCINATIONS. If a specific person's name and company are not explicitly mentioned in the snippet or title, skip that result entirely.
2. Ignore software directories, generic company homepages, and job board postings (unless the posting explicitly names the hiring manager).
3. Extract the exact verbatim quote that shows relevance to the search intent.
4. Assess source quality: KEYNOTE for conference/event bios, INTERVIEW for Q&A/podcasts, PRESS_RELEASE for company announcements, ARTICLE for bylines, DIRECTORY for listings, BLOG_MENTION for passing references.
5. Deduplicate: if the same person appears in multiple results, keep the strongest evidence source.
6. Output ONLY the JSON object below — no markdown fences, no commentary.

You MUST return EXACTLY this JSON structure:
{
  "candidates": [
    {
      "raw_name": "<Extracted First and Last Name>",
      "raw_company": "<Extracted Company Name>",
      "evidence_snippet": "<Exact verbatim quote from the search result>",
      "source_url": "<URL of the result>",
      "source_quality": "<One of: KEYNOTE, INTERVIEW, ARTICLE, PRESS_RELEASE, DIRECTORY, BLOG_MENTION, OTHER>"
    }
  ],
  "validation_telemetry": {
    "layer_confidence": <number 0-100>,
    "reasoning": "<1 sentence explaining extraction success or failure>",
    "is_valid": <true or false — false if no humans were extracted>
  }
}`;

export class HunterStage implements PipelineStage<HunterInput, HunterOutput> {
  readonly name = 'HUNTER';

  async execute(input: HunterInput): Promise<StageResult<HunterOutput>> {
    const router = getLLMRouter();
    const queries = input.strategy.search_strategy.search_queries.semantic;

    const allResults: ExaSearchResult[] = [];

    const peopleQueries = queries.slice(0, 5);
    for (const query of peopleQueries) {
      try {
        const response = await peopleSearch(query, 10);
        allResults.push(...response.results);
      } catch (err) {
        console.error(`[Hunter] People search failed: "${query.slice(0, 60)}..."`, err);
      }
    }

    const generalQueries = queries.slice(5);
    if (generalQueries.length > 0) {
      const generalResults = await batchSemanticSearch(generalQueries, {
        numResults: 10,
        concurrency: 5,
      });
      for (const [, response] of generalResults) {
        allResults.push(...response.results);
      }
    }

    const totalQueries = peopleQueries.length + generalQueries.length;

    if (allResults.length === 0) {
      return {
        output: {
          candidates: [],
          validation_telemetry: {
            layer_confidence: 0,
            reasoning: 'No search results returned for any query',
            is_valid: false,
          },
        },
        telemetry: {
          layer_confidence: 0,
          reasoning: 'No search results returned for any query',
          is_valid: false,
        },
        apiCost: totalQueries * 0.007,
      };
    }

    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    const resultsPayload = uniqueResults.map((r) => ({
      title: r.title,
      url: r.url,
      text: r.text?.slice(0, 1500),
      highlights: r.highlights,
    }));

    const userPrompt = `Target roles: ${input.strategy.search_strategy.target_roles.join(', ')}
Intent keywords: ${input.strategy.search_strategy.intent_keywords.join(', ')}

Raw search results (${resultsPayload.length} unique results from ${totalQueries} queries):

${JSON.stringify(resultsPayload, null, 2)}`;

    const { provider, model, providerName } = router.route('EXTRACTION');
    const output = await provider.generateStructured(
      hunterOutputSchema,
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
      apiCost: totalQueries * 0.007,
    };
  }
}

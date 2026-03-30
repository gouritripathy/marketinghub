import { z } from 'zod';
import { searchStrategySchema } from '@marketinghub/shared';
import type { PipelineStage, StageResult } from '../PipelineStage';
import { getLLMRouter } from '../../llm';
import type { ContextEngineOutput } from './contextEngine';

export type StrategyAgentInput = ContextEngineOutput;
export type StrategyAgentOutput = z.infer<typeof searchStrategySchema>;

const SYSTEM_PROMPT = `You are a Senior Revenue Operations Architect. Your objective is to read an "Offering Blueprint" and output a highly precise, data-driven buyer persona and search strategy.

Rules:
1. Target roles must be senior decision-makers (Director, VP, Head, C-Level) who control budget for the specific value proposition. Exclude all anti_personas.
2. Generate two types of search queries:
   a) "semantic" — natural language queries optimized for neural search APIs (e.g., "VP Portfolio Management at pharma company discussing Planisware migration challenges")
   b) "boolean" — traditional keyword queries (e.g., "VP Portfolio Management" AND "Planisware")
3. Combine the target role with a specific, verifiable pain point or technical keyword from the blueprint.
4. Generate 15-25 diverse search queries covering conference speakers, thought leadership, press releases, and hiring signals.
5. Prioritize source types: KEYNOTE > INTERVIEW > PRESS_RELEASE > ARTICLE > DIRECTORY > BLOG_MENTION.
6. Output ONLY the JSON object below — no markdown fences, no commentary.

You MUST return EXACTLY this JSON structure:
{
  "search_strategy": {
    "target_roles": ["<Exact Title 1>", "<Exact Title 2>"],
    "intent_keywords": ["<Keyword 1>", "<Keyword 2>"],
    "search_queries": {
      "semantic": ["<Natural language query 1>", "<Natural language query 2>"],
      "boolean": ["<Boolean query 1>"]
    },
    "source_type_priority": ["KEYNOTE", "INTERVIEW", "PRESS_RELEASE", "ARTICLE", "DIRECTORY"]
  },
  "validation_telemetry": {
    "layer_confidence": <number 0-100>,
    "reasoning": "<1 sentence explaining why these queries match the blueprint>",
    "is_valid": <true or false>
  }
}`;

export class StrategyAgentStage implements PipelineStage<StrategyAgentInput, StrategyAgentOutput> {
  readonly name = 'STRATEGY_AGENT';

  async execute(input: StrategyAgentInput): Promise<StageResult<StrategyAgentOutput>> {
    const router = getLLMRouter();

    const userPrompt = `Based on the following Offering Blueprint, generate the search strategy:\n\n${JSON.stringify(input.offering_blueprint, null, 2)}`;

    const { provider, model, providerName } = router.route('REASONING');
    const output = await provider.generateStructured(
      searchStrategySchema,
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

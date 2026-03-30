import { z } from 'zod';
import { offeringBlueprintSchema } from '@marketinghub/shared';
import type { PipelineStage, StageResult } from '../PipelineStage';
import { getLLMRouter } from '../../llm';
import { scrapeUrl } from '../external/firecrawl';

export type ContextEngineInput = {
  inputUrl?: string;
  inputText?: string;
  config?: {
    targetGeography?: string[];
    targetCompanySize?: string;
    industryVertical?: string[];
  };
};

export type ContextEngineOutput = z.infer<typeof offeringBlueprintSchema>;

const SYSTEM_PROMPT = `You are a Principal Product Marketing Manager at an enterprise consulting firm.
Your objective is to transform raw, potentially messy user input about a B2B service offering into a highly structured "Offering Blueprint."

Rules:
1. Deduce logical business pain points and technical mechanisms strictly based on the provided text.
2. Define "anti_personas" — job titles that might sound relevant but do NOT hold budget (e.g., "Data Entry Clerks", "Junior Analysts").
3. Define "anti_companies" — company types that are NOT buyers (e.g., "<50 employee startups", "Government agencies").
4. If the input is fundamentally too vague to deduce a B2B value proposition, set is_valid to false.
5. Output ONLY the JSON object below — no markdown fences, no commentary before or after.

You MUST return EXACTLY this JSON structure:
{
  "offering_blueprint": {
    "normalized_offering_name": "<Clean, concise name of the service>",
    "core_value_prop": "<1-sentence summary of the ultimate business outcome>",
    "specific_pain_points_solved": ["<Pain point 1>", "<Pain point 2>"],
    "technical_keywords": ["<e.g., Planisware, R&D data lakes, predictive analytics>"],
    "anti_personas": ["<e.g., Junior Analysts, HR Directors>"],
    "anti_companies": ["<e.g., Startups under 50 employees>"],
    "target_geography": ["<e.g., North America>"],
    "target_company_size": "<e.g., 500-10000>",
    "industry_vertical": ["<e.g., Pharma, Biotech>"]
  },
  "validation_telemetry": {
    "layer_confidence": <number 0-100>,
    "reasoning": "<1 sentence explaining if input was rich enough>",
    "is_valid": <true or false>
  }
}`;

export class ContextEngineStage implements PipelineStage<ContextEngineInput, ContextEngineOutput> {
  readonly name = 'CONTEXT_ENGINE';

  async execute(input: ContextEngineInput): Promise<StageResult<ContextEngineOutput>> {
    const router = getLLMRouter();

    let rawContent = input.inputText ?? '';

    if (input.inputUrl) {
      try {
        const scraped = await scrapeUrl(input.inputUrl);
        rawContent = scraped.markdown;
      } catch (err) {
        if (!rawContent) {
          throw new Error(`Failed to scrape URL and no fallback text provided: ${(err as Error).message}`);
        }
      }
    }

    if (!rawContent || rawContent.trim().length < 20) {
      return {
        output: {
          offering_blueprint: {
            normalized_offering_name: '',
            core_value_prop: '',
            specific_pain_points_solved: [],
            technical_keywords: [],
            anti_personas: [],
          },
          validation_telemetry: {
            layer_confidence: 0,
            reasoning: 'Input is too vague or empty to build a meaningful blueprint',
            is_valid: false,
          },
        },
        telemetry: {
          layer_confidence: 0,
          reasoning: 'Input is too vague or empty to build a meaningful blueprint',
          is_valid: false,
        },
      };
    }

    const configContext = input.config
      ? `\n\nUser-specified filters (incorporate into the blueprint):\n- Geography: ${input.config.targetGeography?.join(', ') || 'Any'}\n- Company Size: ${input.config.targetCompanySize || 'Any'}\n- Industry: ${input.config.industryVertical?.join(', ') || 'Any'}`
      : '';

    const userPrompt = `Analyze the following B2B service offering and produce the Offering Blueprint JSON.\n\n---\n${rawContent.slice(0, 8000)}\n---${configContext}`;

    const { provider, model, providerName } = router.route('REASONING');
    const output = await provider.generateStructured(
      offeringBlueprintSchema,
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

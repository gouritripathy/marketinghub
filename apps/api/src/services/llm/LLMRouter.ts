import { z } from 'zod';
import { env } from '../../config/env';
import { LLMMessage, LLMProvider, LLMUnavailableError } from './LLMProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * Task types determine which LLM provider and model handle the request.
 *
 * REASONING  – complex analysis, ICP deduction, strategy (Claude preferred, OpenAI fallback)
 * EXTRACTION – pulling structured data from messy text (OpenAI)
 * GENERATION – writing sales rationale, scoring justification (Claude preferred, OpenAI fallback)
 * STRUCTURED – strict JSON schema compliance (OpenAI)
 */
export type LLMTaskType = 'REASONING' | 'EXTRACTION' | 'GENERATION' | 'STRUCTURED';

type RouteTarget = {
  provider: LLMProvider;
  model: string;
  providerName: string;
};

const providerCache = new Map<string, LLMProvider>();

function getAnthropicProvider(): LLMProvider | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!providerCache.has('anthropic')) {
    providerCache.set('anthropic', new AnthropicProvider(env.ANTHROPIC_API_KEY));
  }
  return providerCache.get('anthropic')!;
}

function getOpenAIProvider(): LLMProvider {
  if (!env.OPENAI_API_KEY) {
    throw new LLMUnavailableError(
      'OPENAI_API_KEY is required. Set it in your .env file.',
    );
  }
  if (!providerCache.has('openai')) {
    providerCache.set('openai', new OpenAIProvider(env.OPENAI_API_KEY));
  }
  return providerCache.get('openai')!;
}

/**
 * Routing logic: Anthropic is preferred for REASONING and GENERATION tasks,
 * but if ANTHROPIC_API_KEY is not set, falls back to OpenAI for everything.
 * This allows running the full pipeline with just an OpenAI key.
 */
function resolveRoute(taskType: LLMTaskType): RouteTarget {
  const anthropic = getAnthropicProvider();

  switch (taskType) {
    case 'REASONING':
      if (anthropic) {
        return { provider: anthropic, model: env.ANTHROPIC_MODEL_REASONING, providerName: 'anthropic' };
      }
      return { provider: getOpenAIProvider(), model: env.OPENAI_MODEL_EXTRACTION, providerName: 'openai' };

    case 'GENERATION':
      if (anthropic) {
        return { provider: anthropic, model: env.ANTHROPIC_MODEL_GENERATION, providerName: 'anthropic' };
      }
      return { provider: getOpenAIProvider(), model: env.OPENAI_MODEL_EXTRACTION, providerName: 'openai' };

    case 'EXTRACTION':
      return { provider: getOpenAIProvider(), model: env.OPENAI_MODEL_EXTRACTION, providerName: 'openai' };

    case 'STRUCTURED':
      return { provider: getOpenAIProvider(), model: env.OPENAI_MODEL_STRUCTURED, providerName: 'openai' };
  }
}

export class LLMRouter {
  route(taskType: LLMTaskType): RouteTarget {
    return resolveRoute(taskType);
  }

  async generateText(taskType: LLMTaskType, messages: LLMMessage[]): Promise<string> {
    const { provider, model } = this.route(taskType);
    return provider.generateText(messages, model);
  }

  async generateStructured<T>(
    taskType: LLMTaskType,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
  ): Promise<T> {
    const { provider, model } = this.route(taskType);
    return provider.generateStructured(schema, messages, model);
  }
}

let routerInstance: LLMRouter | undefined;

export function getLLMRouter(): LLMRouter {
  if (!routerInstance) {
    routerInstance = new LLMRouter();
  }
  return routerInstance;
}

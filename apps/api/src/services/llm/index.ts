import { env } from '../../config/env';
import { LLMProvider, LLMUnavailableError } from './LLMProvider';
import { OllamaProvider } from './OllamaProvider';
import { GroqProvider } from './GroqProvider';

export { getLLMRouter } from './LLMRouter';
export type { LLMTaskType } from './LLMRouter';

export const getLLMProvider = (): LLMProvider => {
  if (env.LLM_PROVIDER === 'OLLAMA') {
    const baseUrl = env.OLLAMA_URL ?? 'http://localhost:11434';
    return new OllamaProvider(baseUrl);
  }

  if (env.LLM_PROVIDER === 'GROQ') {
    if (!env.GROQ_API_KEY) {
      throw new LLMUnavailableError('GROQ_API_KEY is required');
    }
    return new GroqProvider(env.GROQ_API_KEY);
  }

  throw new LLMUnavailableError();
};

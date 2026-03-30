import { z } from 'zod';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface LLMProvider {
  generateText(messages: LLMMessage[], model: string): Promise<string>;
  generateStructured<T>(schema: z.ZodType<T>, messages: LLMMessage[], model: string): Promise<T>;
}

export class LLMUnavailableError extends Error {
  constructor(message = 'LLM provider not configured') {
    super(message);
    this.name = 'LLMUnavailableError';
  }
}

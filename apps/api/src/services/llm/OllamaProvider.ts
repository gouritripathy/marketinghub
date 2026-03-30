import { z } from 'zod';
import { LLMMessage, LLMProvider } from './LLMProvider';
import { parseStructuredResponse } from './parseStructured';

type OllamaChatResponse = {
  message?: { content?: string };
};

export class OllamaProvider implements LLMProvider {
  constructor(private readonly baseUrl: string) {}

  async generateText(messages: LLMMessage[], model: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content?.trim();
    if (!content) {
      throw new Error('Ollama response missing content');
    }

    return content;
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    model: string,
  ): Promise<T> {
    const systemPrompt =
      'Return ONLY valid JSON that matches the requested schema. Do not include markdown.';

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        format: 'json',
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const text = data.message?.content?.trim();
    if (!text) {
      throw new Error('Ollama response missing content');
    }

    return parseStructuredResponse(schema, text);
  }
}

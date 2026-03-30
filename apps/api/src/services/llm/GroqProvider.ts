import { z } from 'zod';
import { LLMMessage, LLMProvider } from './LLMProvider';
import { parseStructuredResponse } from './parseStructured';

type GroqChatResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

export class GroqProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async generateText(messages: LLMMessage[], model: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Groq request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as GroqChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Groq response missing content');
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Groq request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as GroqChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('Groq response missing content');
    }

    return parseStructuredResponse(schema, text);
  }
}

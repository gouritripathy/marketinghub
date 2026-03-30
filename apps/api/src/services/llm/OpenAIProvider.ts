import { z } from 'zod';
import { LLMMessage, LLMProvider } from './LLMProvider';
import { parseStructuredResponse } from './parseStructured';

type OpenAIChatResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export class OpenAIProvider implements LLMProvider {
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(private readonly apiKey: string) {}

  async generateText(messages: LLMMessage[], model: string): Promise<string> {
    const response = await fetch(this.baseUrl, {
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
      throw new Error(`OpenAI request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI response missing content');
    }

    return content;
  }

  private async makeJsonRequest(messages: LLMMessage[], model: string): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenAI response missing content');
    return text;
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    model: string,
  ): Promise<T> {
    const text = await this.makeJsonRequest(messages, model);

    try {
      return parseStructuredResponse(schema, text);
    } catch (firstError) {
      console.warn(
        `[OpenAI] Structured output parse failed, retrying with error feedback: ${(firstError as Error).message.slice(0, 200)}`,
      );

      const retryMessages: LLMMessage[] = [
        ...messages,
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `Your JSON response did not match the required schema.\n\nValidation error:\n${(firstError as Error).message.slice(0, 500)}\n\nReturn ONLY the corrected JSON. Ensure all required top-level keys are present at the correct nesting level. Do not wrap in extra objects.`,
        },
      ];

      const retryText = await this.makeJsonRequest(retryMessages, model);
      return parseStructuredResponse(schema, retryText);
    }
  }
}

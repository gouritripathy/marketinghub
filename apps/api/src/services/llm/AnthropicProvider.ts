import { z } from 'zod';
import { LLMMessage, LLMProvider } from './LLMProvider';
import { parseStructuredResponse } from './parseStructured';

type AnthropicRole = 'user' | 'assistant';

type AnthropicMessage = {
  role: AnthropicRole;
  content: string;
};

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
};

export class AnthropicProvider implements LLMProvider {
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor(private readonly apiKey: string) {}

  private convertMessages(messages: LLMMessage[]): {
    system: string | undefined;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const converted: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        converted.push({ role: msg.role as AnthropicRole, content: msg.content });
      }
    }

    return { system, messages: converted };
  }

  async generateText(messages: LLMMessage[], model: string): Promise<string> {
    const { system, messages: converted } = this.convertMessages(messages);

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: converted,
    };
    if (system) body.system = system;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Anthropic request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const content = data.content?.find((c) => c.type === 'text')?.text?.trim();
    if (!content) {
      throw new Error('Anthropic response missing text content');
    }

    return content;
  }

  async generateStructured<T>(
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    model: string,
  ): Promise<T> {
    const jsonInstruction: LLMMessage = {
      role: 'system',
      content:
        'CRITICAL: Return ONLY valid JSON. No markdown fences, no commentary. Start with { and end with }.',
    };

    const allMessages = [jsonInstruction, ...messages];
    const text = await this.generateText(allMessages, model);

    try {
      return parseStructuredResponse(schema, text);
    } catch (firstError) {
      console.warn(
        `[Anthropic] Structured output parse failed, retrying: ${(firstError as Error).message.slice(0, 200)}`,
      );

      const retryMessages: LLMMessage[] = [
        ...allMessages,
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `Your JSON response did not match the required schema.\n\nValidation error:\n${(firstError as Error).message.slice(0, 500)}\n\nReturn ONLY the corrected JSON with all required top-level keys.`,
        },
      ];

      const retryText = await this.generateText(retryMessages, model);
      return parseStructuredResponse(schema, retryText);
    }
  }
}

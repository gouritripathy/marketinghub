import { z } from 'zod';

const extractJsonBlock = (input: string): string | null => {
  let start = -1;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '{' || char === '[') {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
};

const unwrapCandidate = (parsed: unknown): unknown[] => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const preferredKeys = ['brief', 'data', 'result', 'output', 'outputJson', 'response'];
  const candidates: unknown[] = [];
  for (const key of preferredKeys) {
    if (key in record) candidates.push(record[key]);
  }
  if (Object.keys(record).length === 1) {
    candidates.push(Object.values(record)[0]);
  }
  return candidates;
};

const iterCandidates = (value: unknown, maxDepth: number, maxNodes: number): unknown[] => {
  const results: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && visited < maxNodes) {
    const current = queue.shift();
    if (!current) break;
    const { value: node, depth } = current;
    visited += 1;

    if (node && typeof node === 'object') {
      results.push(node);
      if (depth < maxDepth) {
        if (Array.isArray(node)) {
          for (const item of node) {
            queue.push({ value: item, depth: depth + 1 });
          }
        } else {
          for (const child of Object.values(node as Record<string, unknown>)) {
            queue.push({ value: child, depth: depth + 1 });
          }
        }
      }
    }
  }

  return results;
};

const tryParseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeBlocksContent = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.blocks)) return value;

  const normalizedBlocks = (record.blocks as Array<unknown>).map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    const blockRecord = block as Record<string, unknown>;
    const content = blockRecord.content;
    if (Array.isArray(content)) {
      return { ...blockRecord, content: content.join('\n') };
    }
    return blockRecord;
  });

  return { ...record, blocks: normalizedBlocks };
};

const normalizeOptionalStrings = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ('edit_summary' in record && typeof record.edit_summary === 'string') {
    const trimmed = record.edit_summary.trim();
    return { ...record, edit_summary: trimmed.length > 0 ? trimmed : undefined };
  }
  return value;
};

export const parseStructuredResponse = <T>(schema: z.ZodType<T>, text: string): T => {
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const sanitized = cleaned
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return !(code <= 25 || (code >= 27 && code <= 31));
      })
      .join('');
    const extracted = extractJsonBlock(sanitized);
    if (!extracted) {
      throw new Error(`Failed to parse JSON from LLM: ${(error as Error).message}`);
    }
    parsed = JSON.parse(extracted);
  }

  parsed = normalizeOptionalStrings(normalizeBlocksContent(tryParseJson(parsed)));
  const direct = schema.safeParse(parsed);
  if (direct.success) return direct.data;

  const candidates = [
    ...unwrapCandidate(parsed),
    ...iterCandidates(parsed, 3, 200),
  ].map((candidate) =>
    normalizeOptionalStrings(normalizeBlocksContent(tryParseJson(candidate))),
  );
  for (const candidate of candidates) {
    const nested = schema.safeParse(candidate);
    if (nested.success) return nested.data;
  }

  throw new Error(direct.error.message);
};

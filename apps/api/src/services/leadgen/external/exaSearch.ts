import Exa from 'exa-js';
import { env } from '../../../config/env';

export type ExaSearchResult = {
  title: string;
  url: string;
  text?: string;
  highlights?: string[];
  publishedDate?: string;
  score?: number;
};

export type ExaSearchResponse = {
  results: ExaSearchResult[];
};

let exaClient: Exa | undefined;

function getClient(): Exa {
  if (!env.EXA_API_KEY) {
    throw new Error('EXA_API_KEY is not configured');
  }
  if (!exaClient) {
    exaClient = new Exa(env.EXA_API_KEY);
  }
  return exaClient;
}

/**
 * Semantic search using Exa's neural search with people category support.
 * Uses `category: "people"` when searching for decision-makers.
 */
export async function semanticSearch(
  query: string,
  options?: {
    numResults?: number;
    type?: 'auto' | 'neural' | 'keyword';
    category?: 'people' | 'company' | 'news' | 'tweet';
    startPublishedDate?: string;
  },
): Promise<ExaSearchResponse> {
  const exa = getClient();

  const searchOptions: Record<string, unknown> = {
    type: options?.type ?? 'auto',
    numResults: options?.numResults ?? 10,
    contents: {
      highlights: { maxCharacters: 4000 },
    },
  };

  if (options?.category) {
    searchOptions.category = options.category;
  }

  if (options?.startPublishedDate) {
    searchOptions.startPublishedDate = options.startPublishedDate;
  }

  const response = await exa.search(query, searchOptions);

  return {
    results: (response.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      text: r.text,
      highlights: r.highlights,
      publishedDate: r.publishedDate,
      score: r.score,
    })),
  };
}

/**
 * People-specific search using Exa's dedicated people index.
 * Best for finding decision-makers by role and expertise.
 */
export async function peopleSearch(
  query: string,
  numResults = 10,
): Promise<ExaSearchResponse> {
  return semanticSearch(query, {
    numResults,
    type: 'auto',
    category: 'people',
  });
}

/**
 * Batch search with concurrency control.
 * Runs multiple queries in parallel (default 5 concurrent) and collects results.
 */
export async function batchSemanticSearch(
  queries: string[],
  options?: {
    numResults?: number;
    concurrency?: number;
    category?: 'people' | 'company' | 'news';
  },
): Promise<Map<string, ExaSearchResponse>> {
  const concurrency = options?.concurrency ?? 5;
  const results = new Map<string, ExaSearchResponse>();
  const queue = [...queries];

  const processNext = async () => {
    while (queue.length > 0) {
      const query = queue.shift()!;
      try {
        const result = await semanticSearch(query, {
          numResults: options?.numResults ?? 10,
          category: options?.category,
        });
        results.set(query, result);
      } catch (err) {
        console.error(`[ExaSearch] Query failed: "${query.slice(0, 60)}..."`, err);
        results.set(query, { results: [] });
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queries.length) }, () =>
    processNext(),
  );
  await Promise.allSettled(workers);

  return results;
}

import { env } from '../../config/env';

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

type SearxResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
};

export const SearchService = {
  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!env.SEARXNG_URL) return [];

    const response = await fetch(`${env.SEARXNG_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': '127.0.0.1',
        'X-Real-IP': '127.0.0.1',
        ...(env.SEARXNG_API_KEY ? { Authorization: `Bearer ${env.SEARXNG_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        q: query,
        format: 'json',
        engines: ['google', 'bing'],
      }),
    });

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return [];
    }

    let data: SearxResponse;
    try {
      data = (await response.json()) as SearxResponse;
    } catch {
      return [];
    }
    const results = data.results ?? [];
    return results
      .map((item) => ({
        title: item.title ?? '',
        url: item.url ?? '',
        snippet: item.content ?? '',
      }))
      .filter((item) => item.title && item.url)
      .slice(0, limit);
  },
};

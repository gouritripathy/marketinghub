import Firecrawl from '@mendable/firecrawl-js';
import { env } from '../../../config/env';

export type FirecrawlResult = {
  markdown: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
  };
};

let firecrawlClient: Firecrawl | undefined;

function getClient(): Firecrawl {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not configured');
  }
  if (!firecrawlClient) {
    firecrawlClient = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
  }
  return firecrawlClient;
}

export async function scrapeUrl(url: string): Promise<FirecrawlResult> {
  const client = getClient();

  const response = await client.scrapeUrl(url, {
    formats: ['markdown'],
  });

  if (!response.success) {
    throw new Error(`Firecrawl scrape failed: ${response.error ?? 'Unknown error'}`);
  }

  return {
    markdown: response.markdown ?? '',
    metadata: {
      title: response.metadata?.title,
      description: response.metadata?.description,
      sourceURL: response.metadata?.sourceURL ?? url,
    },
  };
}

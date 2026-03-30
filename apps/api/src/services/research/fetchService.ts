const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type FetchedSource = {
  url: string;
  title: string;
  cleanText: string;
  fetchedAt: string;
  hash: string;
};

const hashText = async (text: string) => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const extractTitle = (html: string) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim() ?? '';
};

export const FetchService = {
  async fetchUrl(url: string): Promise<FetchedSource | null> {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'MarketingHub/1.0' },
    });

    if (!response.ok) return null;
    const html = await response.text();
    const title = extractTitle(html);
    const cleanText = stripHtml(html);
    if (!cleanText) return null;

    const hash = await hashText(cleanText);
    return {
      url,
      title,
      cleanText,
      fetchedAt: new Date().toISOString(),
      hash,
    };
  },
};

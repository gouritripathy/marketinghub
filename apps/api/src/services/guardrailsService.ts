import { env } from '../config/env';

type GuardrailInput = {
  contentText: string;
  topic?: string;
  requiredKeywords: string[];
  allowedHosts: string[];
  forbiddenPhrases: string[];
  requiredBlockTypes: string[];
  blockTypesPresent: string[];
  minWords?: number;
  maxWords?: number;
  maxCtaBlocks?: number;
  placeholderPattern?: RegExp;
};

const extractUrls = (text: string) => {
  const matches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return matches.map((url) => url.trim());
};

const normalize = (value: string) => value.trim().toLowerCase();

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const extractTopicTerms = (topic?: string) => {
  if (!topic) return [];
  return topic
    .split(/[\s/,-]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 4);
};

export const GuardrailsService = {
  run(input: GuardrailInput) {
    const flags: string[] = [];
    const lowerContent = normalize(input.contentText);

    for (const phrase of input.forbiddenPhrases) {
      if (phrase && lowerContent.includes(normalize(phrase))) {
        flags.push(`forbidden_phrase:${phrase}`);
      }
    }

    const requiredMissing = input.requiredKeywords.filter(
      (keyword) => !lowerContent.includes(normalize(keyword)),
    );
    for (const keyword of requiredMissing) {
      flags.push(`missing_keyword:${keyword}`);
    }

    if (input.topic) {
      const topicTerms = extractTopicTerms(input.topic);
      const missingTopicTerms = topicTerms.filter((term) => !lowerContent.includes(term));
      if (topicTerms.length > 0 && missingTopicTerms.length === topicTerms.length) {
        flags.push('topic_misalignment');
      }
    }

    if (input.placeholderPattern && input.placeholderPattern.test(input.contentText)) {
      flags.push('placeholder_tokens');
    }

    if (typeof input.maxCtaBlocks === 'number') {
      const ctaCount = input.blockTypesPresent.filter((type) => type.toLowerCase() === 'cta').length;
      if (ctaCount > input.maxCtaBlocks) {
        flags.push(`too_many_cta:${ctaCount}`);
      }
    }

    if (typeof input.minWords === 'number' || typeof input.maxWords === 'number') {
      const wordCount = countWords(input.contentText);
      if (typeof input.minWords === 'number' && wordCount < input.minWords) {
        flags.push(`length_short:${wordCount}`);
      }
      if (typeof input.maxWords === 'number' && wordCount > input.maxWords) {
        flags.push(`length_long:${wordCount}`);
      }
    }

    const banned = (env.BANNED_PHRASES ?? '')
      .split(',')
      .map((phrase) => phrase.trim())
      .filter(Boolean);
    for (const phrase of banned) {
      if (phrase && lowerContent.includes(normalize(phrase))) {
        flags.push(`banned_phrase:${phrase}`);
      }
    }

    const urls = extractUrls(input.contentText);
    const allowedHosts = input.allowedHosts.map(normalize);
    for (const url of urls) {
      try {
        const host = new URL(url).host.toLowerCase();
        if (!allowedHosts.some((allowed) => host.endsWith(allowed))) {
          flags.push(`external_link:${url}`);
        }
      } catch {
        flags.push(`invalid_link:${url}`);
      }
    }

    for (const requiredType of input.requiredBlockTypes) {
      if (!input.blockTypesPresent.includes(requiredType)) {
        flags.push(`missing_section:${requiredType}`);
      }
    }

    return flags;
  },
};

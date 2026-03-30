import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
dotenv.config({ path: envPath });

const envSchema = z.object({
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  CORS_ORIGIN: z.string().min(1),
  COOKIE_DOMAIN: z.string().min(1),
  DISABLE_REGISTRATION: z.string().default('true'),

  // Content pipeline LLM
  LLM_PROVIDER: z.enum(['OLLAMA', 'GROQ']).optional(),
  OLLAMA_URL: z.string().optional(),
  OLLAMA_MODEL_PLANNER: z.string().optional(),
  OLLAMA_MODEL_EXTRACTOR: z.string().optional(),
  OLLAMA_MODEL_WRITER: z.string().optional(),
  OLLAMA_MODEL_EDITOR: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL_PLANNER: z.string().optional(),
  GROQ_MODEL_EXTRACTOR: z.string().optional(),
  GROQ_MODEL_WRITER: z.string().optional(),
  GROQ_MODEL_EDITOR: z.string().optional(),
  SEARXNG_URL: z.string().optional(),
  SEARXNG_API_KEY: z.string().optional(),
  INTERNAL_LINK_HOSTS: z.string().optional(),
  BANNED_PHRASES: z.string().optional(),

  // Lead Gen — LLM providers
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_REASONING: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_MODEL_GENERATION: z.string().default('claude-sonnet-4-20250514'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_EXTRACTION: z.string().default('gpt-4.1'),
  OPENAI_MODEL_STRUCTURED: z.string().default('gpt-4.1'),

  // Lead Gen — External APIs
  EXA_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  NINJAPEAR_API_KEY: z.string().optional(),
  CORESIGNAL_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  ZEROBOUNCE_API_KEY: z.string().optional(),

  // Lead Gen — Queue
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Lead Gen — Budget
  LEAD_PIPELINE_MAX_COST: z.string().default('5.00'),
  LEAD_PIPELINE_CONCURRENCY: z.string().default('3'),
});

export const env = envSchema.parse(process.env);

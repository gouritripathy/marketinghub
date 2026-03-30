import { Router } from 'express';
import { z } from 'zod';
import { contentGoalSchema } from '@marketinghub/shared';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { fail, ok } from '../utils/apiResponse';
import { ContentPipelineService } from '../services/contentPipelineService';

const router = Router();

const intakeSchema = z.object({
  contentGoal: contentGoalSchema,
  topic: z.string().min(1),
  persona: z.string().min(1),
  tone: z.string().min(1).optional(),
  requiredKeywords: z.array(z.string().min(1)).optional(),
  region: z.string().min(1).optional(),
  length: z.string().min(1).optional(),
  internalContext: z.array(z.string().min(1)).optional(),
  outputPreference: z.string().min(1).optional(),
});

const runPipelineSchema = z.object({
  enableWeb: z.boolean().optional(),
  internalSources: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().min(1).optional(),
        text: z.string().min(1),
      }),
    )
    .optional(),
  steps: z.array(z.string().min(1)).optional(),
});

const quickGenerateSchema = z.object({
  prompt: z.string().min(1),
  contentGoal: contentGoalSchema.default('BLOG'),
  persona: z.string().min(1).default('VP of Marketing'),
  tone: z.string().min(1).optional(),
  requiredKeywords: z.array(z.string().min(1)).optional(),
  region: z.string().min(1).optional(),
  length: z.string().min(1).optional(),
});

router.post(
  '/content/intake',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = intakeSchema.parse(req.body);
    const result = await ContentPipelineService.intake({
      userId: req.user!.id,
      contentGoal: payload.contentGoal,
      topic: payload.topic,
      persona: payload.persona,
      tone: payload.tone,
      requiredKeywords: payload.requiredKeywords,
      region: payload.region,
      length: payload.length,
      internalContext: payload.internalContext,
      outputPreference: payload.outputPreference,
    });

    return res.status(201).json(ok(result));
  }),
);

router.post(
  '/content/pipeline/:versionId/run',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = runPipelineSchema.parse(req.body ?? {});
    const result = await ContentPipelineService.runPipeline(req.params.versionId, req.user!.teamId, {
      enableWeb: payload.enableWeb,
      internalSources: payload.internalSources,
      steps: payload.steps,
    });

    if (!result) {
      return res.status(404).json(fail('NOT_FOUND', 'Version not found'));
    }

    return res.json(ok(result));
  }),
);

router.post(
  '/content/quick-generate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = quickGenerateSchema.parse(req.body ?? {});
    const outputJson = await ContentPipelineService.quickGenerate({
      prompt: payload.prompt,
      contentGoal: payload.contentGoal,
      persona: payload.persona,
      tone: payload.tone,
      requiredKeywords: payload.requiredKeywords,
      region: payload.region,
      length: payload.length,
    });
    const pipelineErrors = Array.isArray(outputJson.pipeline_errors)
      ? outputJson.pipeline_errors
      : [];
    const lengthError = pipelineErrors.find((error) => error.startsWith('length_not_met:'));
    if (lengthError) {
      return res.status(422).json(fail('LENGTH_NOT_MET', 'Output did not meet length requirement', {
        outputJson,
        reason: lengthError,
      }));
    }

    return res.json(ok({ outputJson }));
  }),
);

router.post(
  '/content/quick-generate-text',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = quickGenerateSchema.parse(req.body ?? {});
    const result = await ContentPipelineService.quickGenerateText({
      prompt: payload.prompt,
      contentGoal: payload.contentGoal,
      persona: payload.persona,
      tone: payload.tone,
      requiredKeywords: payload.requiredKeywords,
      region: payload.region,
      length: payload.length,
    });

    return res.json(ok(result));
  }),
);

export default router;

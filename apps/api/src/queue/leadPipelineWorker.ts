import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './connection';
import { LEAD_PIPELINE_QUEUE, type LeadPipelineJobData } from './leadPipelineQueue';
import { LeadPipelineOrchestrator } from '../services/leadgen/LeadPipelineOrchestrator';
import { env } from '../config/env';

async function processJob(job: Job<LeadPipelineJobData>): Promise<void> {
  const { runId, teamId } = job.data;

  const orchestrator = new LeadPipelineOrchestrator();
  await orchestrator.execute(runId, teamId, (layer, status) => {
    void job.updateProgress({ layer, status });
  });
}

let workerInstance: Worker<LeadPipelineJobData> | undefined;

export function startLeadPipelineWorker(): Worker<LeadPipelineJobData> {
  if (workerInstance) return workerInstance;

  const concurrency = Number(env.LEAD_PIPELINE_CONCURRENCY) || 3;

  workerInstance = new Worker<LeadPipelineJobData>(
    LEAD_PIPELINE_QUEUE,
    processJob,
    {
      connection: getRedisConnectionOpts(),
      concurrency,
    },
  );

  workerInstance.on('completed', (job) => {
    console.log(`[LeadPipeline] Job ${job.id} completed for run ${job.data.runId}`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[LeadPipeline] Job ${job?.id} failed:`, err.message);
  });

  console.log(`[LeadPipeline] Worker started with concurrency=${concurrency}`);
  return workerInstance;
}

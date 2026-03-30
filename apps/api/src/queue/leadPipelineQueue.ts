import { Queue } from 'bullmq';
import { getRedisConnectionOpts } from './connection';

export type LeadPipelineJobData = {
  runId: string;
  campaignId: string;
  teamId: string;
  userId: string;
};

export const LEAD_PIPELINE_QUEUE = 'lead-pipeline';

let queueInstance: Queue<LeadPipelineJobData> | undefined;

export function getLeadPipelineQueue(): Queue<LeadPipelineJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<LeadPipelineJobData>(LEAD_PIPELINE_QUEUE, {
      connection: getRedisConnectionOpts(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queueInstance;
}

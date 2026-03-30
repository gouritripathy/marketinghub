import { PrismaClient } from '@prisma/client';
import type { LeadLayerName } from '@prisma/client';
import { ContextEngineStage, type ContextEngineInput } from './layers/contextEngine';
import { StrategyAgentStage } from './layers/strategyAgent';
import { HunterStage } from './layers/hunter';
import { VerifierStage } from './layers/verifier';
import { PostmanStage } from './layers/postman';
import { JudgeStage } from './layers/judge';
import { deductCredits } from './creditService';

const prisma = new PrismaClient();

type ProgressCallback = (layer: LeadLayerName, status: string) => void;

export class LeadPipelineOrchestrator {
  private contextEngine = new ContextEngineStage();
  private strategyAgent = new StrategyAgentStage();
  private hunter = new HunterStage();
  private verifier = new VerifierStage();
  private postman = new PostmanStage();
  private judge = new JudgeStage();

  async execute(
    runId: string,
    teamId: string,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const run = await prisma.leadPipelineRun.findUniqueOrThrow({
      where: { id: runId },
      include: { campaign: true },
    });

    let totalCost = 0;

    try {
      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date(), currentLayer: 'CONTEXT_ENGINE' },
      });

      // ── Layer 0: Context Engine ──
      onProgress?.('CONTEXT_ENGINE', 'running');
      const layer0Result = await this.executeLayer(runId, 'CONTEXT_ENGINE', async () => {
        const input: ContextEngineInput = {
          inputUrl: run.campaign.inputUrl ?? undefined,
          inputText: run.campaign.inputText ?? undefined,
          config: (run.campaign.configJson as ContextEngineInput['config']) ?? undefined,
        };
        return this.contextEngine.execute(input);
      });

      totalCost += layer0Result.apiCost ?? 0;

      if (!layer0Result.telemetry.is_valid) {
        await this.failRun(runId, 'CONTEXT_ENGINE', layer0Result.telemetry.reasoning, totalCost);
        onProgress?.('CONTEXT_ENGINE', 'failed');
        return;
      }

      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: { blueprintJson: layer0Result.output as object, currentLayer: 'STRATEGY_AGENT' },
      });
      onProgress?.('CONTEXT_ENGINE', 'completed');

      // ── Layer 1: Strategy Agent ──
      onProgress?.('STRATEGY_AGENT', 'running');
      const layer1Result = await this.executeLayer(runId, 'STRATEGY_AGENT', async () =>
        this.strategyAgent.execute(layer0Result.output),
      );

      totalCost += layer1Result.apiCost ?? 0;

      if (!layer1Result.telemetry.is_valid) {
        await this.failRun(runId, 'STRATEGY_AGENT', layer1Result.telemetry.reasoning, totalCost);
        onProgress?.('STRATEGY_AGENT', 'failed');
        return;
      }

      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: { strategyJson: layer1Result.output as object, currentLayer: 'HUNTER' },
      });
      onProgress?.('STRATEGY_AGENT', 'completed');

      // ── Layer 2: Hunter ──
      onProgress?.('HUNTER', 'running');
      const layer2Result = await this.executeLayer(runId, 'HUNTER', async () =>
        this.hunter.execute({ strategy: layer1Result.output }),
      );

      totalCost += layer2Result.apiCost ?? 0;

      if (!layer2Result.telemetry.is_valid || layer2Result.output.candidates.length === 0) {
        await this.failRun(runId, 'HUNTER', 'No candidates discovered', totalCost);
        onProgress?.('HUNTER', 'failed');
        return;
      }

      const candidates = layer2Result.output.candidates;
      for (const c of candidates) {
        await prisma.leadCandidate.create({
          data: {
            runId,
            status: 'DISCOVERED',
            rawName: c.raw_name,
            rawCompany: c.raw_company,
            evidenceSnippet: c.evidence_snippet,
            sourceUrl: c.source_url,
            sourceQuality: c.source_quality ?? 'OTHER',
          },
        });
      }
      onProgress?.('HUNTER', 'completed');

      // ── Layers 3-5: Per-candidate waterfall ──
      const dbCandidates = await prisma.leadCandidate.findMany({
        where: { runId, status: 'DISCOVERED' },
      });

      // Layer 3: Verifier
      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: { currentLayer: 'VERIFIER' },
      });
      onProgress?.('VERIFIER', 'running');

      const verifierLog = await prisma.leadPipelineLayerLog.create({
        data: { runId, layer: 'VERIFIER', status: 'RUNNING', startedAt: new Date() },
      });

      const postmanLog = await prisma.leadPipelineLayerLog.create({
        data: { runId, layer: 'POSTMAN', status: 'RUNNING', startedAt: new Date() },
      });

      const judgeLog = await prisma.leadPipelineLayerLog.create({
        data: { runId, layer: 'JUDGE', status: 'RUNNING', startedAt: new Date() },
      });

      let verifiedCount = 0;
      let droppedCount = 0;
      const maxConcurrent = 5;
      const candidateQueue = [...dbCandidates];

      const processCandidateWaterfall = async () => {
        while (candidateQueue.length > 0) {
          const candidate = candidateQueue.shift()!;

          try {
            // Layer 3: Deep Research & Triangulation
            const verifyResult = await this.verifier.execute({
              candidate: {
                raw_name: candidate.rawName,
                raw_company: candidate.rawCompany,
                evidence_snippet: candidate.evidenceSnippet ?? '',
                source_url: candidate.sourceUrl ?? '',
              },
              blueprint: (layer0Result.output as any).offering_blueprint,
            });
            totalCost += verifyResult.apiCost ?? 0;

            if (!verifyResult.telemetry.is_valid) {
              await prisma.leadCandidate.update({
                where: { id: candidate.id },
                data: {
                  status: 'DROPPED',
                  droppedAtLayer: 'VERIFIER',
                  dropReason: verifyResult.telemetry.reasoning,
                },
              });
              droppedCount++;
              continue;
            }

            const v = verifyResult.output.verified_identity;
            await prisma.leadCandidate.update({
              where: { id: candidate.id },
              data: {
                status: 'VERIFIED',
                verifiedFirstName: v.first_name,
                verifiedLastName: v.last_name,
                verifiedCompany: v.current_company,
                verifiedTitle: v.current_title,
                companyDomain: v.company_domain,
              },
            });

            // Layer 4: Contact Resolution
            const contactResult = await this.postman.execute({
              firstName: v.first_name,
              lastName: v.last_name,
              companyDomain: v.company_domain,
            });
            totalCost += contactResult.apiCost ?? 0;

            if (!contactResult.telemetry.is_valid) {
              await prisma.leadCandidate.update({
                where: { id: candidate.id },
                data: {
                  status: 'DROPPED',
                  droppedAtLayer: 'POSTMAN',
                  dropReason: contactResult.telemetry.reasoning,
                },
              });
              droppedCount++;
              continue;
            }

            await prisma.leadCandidate.update({
              where: { id: candidate.id },
              data: {
                status: 'CONTACT_RESOLVED',
                verifiedEmail: contactResult.output.contact_data.verified_email,
                deliverabilityStatus: contactResult.output.contact_data.deliverability_status,
              },
            });

            // Layer 5: Score & Assemble
            const marketSignals = verifyResult.output.market_research_signals;
            const judgeResult = await this.judge.execute({
              blueprintName: (layer0Result.output as any).offering_blueprint.normalized_offering_name,
              targetRoles: layer1Result.output.search_strategy.target_roles,
              candidate: {
                rawName: candidate.rawName,
                rawCompany: candidate.rawCompany,
                evidenceSnippet: candidate.evidenceSnippet ?? '',
                sourceUrl: candidate.sourceUrl ?? '',
                sourceQuality: candidate.sourceQuality ?? undefined,
              },
              verified: {
                firstName: v.first_name,
                lastName: v.last_name,
                currentCompany: v.current_company,
                currentTitle: v.current_title,
                companyDomain: v.company_domain,
              },
              contact: {
                verifiedEmail: contactResult.output.contact_data.verified_email,
                deliverabilityStatus: contactResult.output.contact_data.deliverability_status,
              },
              marketResearch: {
                personRecencyProof: marketSignals.person_recency_proof,
                companyIntentSignal: marketSignals.company_intent_signal,
                companyFitAnalysis: marketSignals.company_fit_analysis,
              },
              layerTelemetry: [
                { layer: 'CONTEXT_ENGINE', confidence: layer0Result.telemetry.layer_confidence, is_valid: true },
                { layer: 'STRATEGY_AGENT', confidence: layer1Result.telemetry.layer_confidence, is_valid: true },
                { layer: 'HUNTER', confidence: layer2Result.telemetry.layer_confidence, is_valid: true },
                { layer: 'VERIFIER', confidence: verifyResult.telemetry.layer_confidence, is_valid: true },
                { layer: 'POSTMAN', confidence: contactResult.telemetry.layer_confidence, is_valid: true },
              ],
            });
            totalCost += judgeResult.apiCost ?? 0;

            const payload = judgeResult.output.final_crm_payload;
            const score = payload.Lead_Score;

            await prisma.leadCandidate.update({
              where: { id: candidate.id },
              data: { status: 'SCORED', leadScore: score },
            });

            if (judgeResult.telemetry.is_valid && score > 0) {
              await prisma.leadResult.create({
                data: {
                  candidateId: candidate.id,
                  runId,
                  firstName: payload.First_Name,
                  lastName: payload.Last_Name,
                  company: payload.Company,
                  title: payload.Title,
                  email: payload.Email,
                  leadScore: score,
                  salesRationale: payload.Sales_Rationale,
                  evidenceUrl: payload.Evidence_URL,
                  scoreBreakdownJson: payload.Score_Breakdown as object,
                  crmPayloadJson: payload as object,
                },
              });
              verifiedCount++;
            }
          } catch (err) {
            console.error(`[Pipeline] Candidate ${candidate.id} failed:`, (err as Error).message);
            await prisma.leadCandidate.update({
              where: { id: candidate.id },
              data: {
                status: 'DROPPED',
                droppedAtLayer: 'VERIFIER',
                dropReason: (err as Error).message.slice(0, 500),
              },
            });
            droppedCount++;
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(maxConcurrent, dbCandidates.length) },
        () => processCandidateWaterfall(),
      );
      await Promise.allSettled(workers);

      const now = new Date();
      const verifierDuration = now.getTime() - verifierLog.startedAt!.getTime();

      await prisma.leadPipelineLayerLog.update({
        where: { id: verifierLog.id },
        data: {
          status: 'COMPLETED',
          durationMs: verifierDuration,
          completedAt: now,
          telemetryJson: {
            layer_confidence: dbCandidates.length > 0 ? Math.round((1 - droppedCount / dbCandidates.length) * 100) : 0,
            reasoning: `${dbCandidates.length} candidates processed, ${dbCandidates.length - droppedCount} passed verification`,
            is_valid: true,
          },
        },
      });
      onProgress?.('VERIFIER', 'completed');

      await prisma.leadPipelineLayerLog.update({
        where: { id: postmanLog.id },
        data: {
          status: 'COMPLETED',
          durationMs: verifierDuration,
          completedAt: now,
          telemetryJson: {
            layer_confidence: verifiedCount > 0 ? 80 : 0,
            reasoning: `${verifiedCount} contacts resolved and verified`,
            is_valid: true,
          },
        },
      });
      onProgress?.('POSTMAN', 'completed');

      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: { currentLayer: 'JUDGE' },
      });

      await prisma.leadPipelineLayerLog.update({
        where: { id: judgeLog.id },
        data: {
          status: 'COMPLETED',
          durationMs: verifierDuration,
          completedAt: now,
          telemetryJson: {
            layer_confidence: verifiedCount > 0 ? 90 : 0,
            reasoning: `${verifiedCount} leads scored and CRM payloads assembled`,
            is_valid: true,
          },
        },
      });
      onProgress?.('JUDGE', 'completed');

      // Deduct credits
      if (verifiedCount > 0) {
        try {
          await deductCredits(teamId, verifiedCount, `Pipeline run ${runId}: ${verifiedCount} leads`, runId);
        } catch (err) {
          console.error(`[Pipeline] Credit deduction failed:`, (err as Error).message);
        }
      }

      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalCost,
          creditsUsed: verifiedCount,
          currentLayer: null,
        },
      });

      await prisma.leadCampaign.update({
        where: { id: run.campaignId },
        data: { status: 'COMPLETED' },
      });
    } catch (err) {
      console.error(`[Pipeline] Run ${runId} failed:`, (err as Error).message);
      await prisma.leadPipelineRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: (err as Error).message.slice(0, 1000),
          totalCost,
          currentLayer: null,
        },
      });
      await prisma.leadCampaign.update({
        where: { id: run.campaignId },
        data: { status: 'FAILED' },
      });
    }
  }

  private async executeLayer<T>(
    runId: string,
    layer: LeadLayerName,
    fn: () => Promise<{ output: T; telemetry: any; llmProvider?: string; llmModel?: string; llmTokensUsed?: number; apiCost?: number }>,
  ) {
    const startedAt = new Date();

    const log = await prisma.leadPipelineLayerLog.create({
      data: { runId, layer, status: 'RUNNING', startedAt },
    });

    try {
      const result = await fn();

      await prisma.leadPipelineLayerLog.update({
        where: { id: log.id },
        data: {
          status: 'COMPLETED',
          outputJson: result.output as object,
          telemetryJson: result.telemetry,
          llmProvider: result.llmProvider,
          llmModel: result.llmModel,
          llmTokensUsed: result.llmTokensUsed,
          apiCost: result.apiCost,
          durationMs: Date.now() - startedAt.getTime(),
          completedAt: new Date(),
        },
      });

      return result;
    } catch (err) {
      await prisma.leadPipelineLayerLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorMessage: (err as Error).message.slice(0, 1000),
          telemetryJson: {
            layer_confidence: 0,
            reasoning: (err as Error).message.slice(0, 200),
            is_valid: false,
          },
          durationMs: Date.now() - startedAt.getTime(),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async failRun(
    runId: string,
    failedLayer: LeadLayerName,
    reason: string,
    totalCost: number,
  ) {
    await prisma.leadPipelineRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: `Pipeline halted at ${failedLayer}: ${reason}`,
        totalCost,
        currentLayer: null,
      },
    });
  }
}

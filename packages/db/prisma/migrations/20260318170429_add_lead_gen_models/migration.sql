-- CreateEnum
CREATE TYPE "LeadCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadPipelineRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadLayerName" AS ENUM ('CONTEXT_ENGINE', 'STRATEGY_AGENT', 'HUNTER', 'VERIFIER', 'POSTMAN', 'JUDGE');

-- CreateEnum
CREATE TYPE "LeadLayerStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LeadCandidateStatus" AS ENUM ('DISCOVERED', 'VERIFIED', 'CONTACT_RESOLVED', 'SCORED', 'DROPPED');

-- CreateEnum
CREATE TYPE "CreditTxType" AS ENUM ('PURCHASE', 'USAGE', 'REFUND', 'BONUS');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeadCampaign" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inputUrl" TEXT,
    "inputText" TEXT,
    "status" "LeadCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPipelineRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "LeadPipelineRunStatus" NOT NULL DEFAULT 'QUEUED',
    "currentLayer" "LeadLayerName",
    "blueprintJson" JSONB,
    "strategyJson" JSONB,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPipelineLayerLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "layer" "LeadLayerName" NOT NULL,
    "status" "LeadLayerStatus" NOT NULL DEFAULT 'PENDING',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "telemetryJson" JSONB,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "llmTokensUsed" INTEGER,
    "apiCost" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPipelineLayerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "LeadCandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rawName" TEXT NOT NULL,
    "rawCompany" TEXT NOT NULL,
    "evidenceSnippet" TEXT,
    "sourceUrl" TEXT,
    "sourceQuality" TEXT,
    "verifiedFirstName" TEXT,
    "verifiedLastName" TEXT,
    "verifiedCompany" TEXT,
    "verifiedTitle" TEXT,
    "companyDomain" TEXT,
    "verifiedEmail" TEXT,
    "deliverabilityStatus" TEXT,
    "leadScore" INTEGER,
    "droppedAtLayer" "LeadLayerName",
    "dropReason" TEXT,
    "layerDataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadResult" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "leadScore" INTEGER NOT NULL,
    "salesRationale" TEXT NOT NULL,
    "evidenceUrl" TEXT NOT NULL,
    "scoreBreakdownJson" JSONB,
    "crmPayloadJson" JSONB NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "txType" "CreditTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT,
    "refRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCampaign_teamId_idx" ON "LeadCampaign"("teamId");

-- CreateIndex
CREATE INDEX "LeadCampaign_createdByUserId_idx" ON "LeadCampaign"("createdByUserId");

-- CreateIndex
CREATE INDEX "LeadCampaign_status_idx" ON "LeadCampaign"("status");

-- CreateIndex
CREATE INDEX "LeadCampaign_createdAt_idx" ON "LeadCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "LeadPipelineRun_campaignId_idx" ON "LeadPipelineRun"("campaignId");

-- CreateIndex
CREATE INDEX "LeadPipelineRun_status_idx" ON "LeadPipelineRun"("status");

-- CreateIndex
CREATE INDEX "LeadPipelineRun_createdAt_idx" ON "LeadPipelineRun"("createdAt");

-- CreateIndex
CREATE INDEX "LeadPipelineLayerLog_runId_idx" ON "LeadPipelineLayerLog"("runId");

-- CreateIndex
CREATE INDEX "LeadPipelineLayerLog_layer_idx" ON "LeadPipelineLayerLog"("layer");

-- CreateIndex
CREATE INDEX "LeadPipelineLayerLog_createdAt_idx" ON "LeadPipelineLayerLog"("createdAt");

-- CreateIndex
CREATE INDEX "LeadCandidate_runId_idx" ON "LeadCandidate"("runId");

-- CreateIndex
CREATE INDEX "LeadCandidate_status_idx" ON "LeadCandidate"("status");

-- CreateIndex
CREATE INDEX "LeadCandidate_createdAt_idx" ON "LeadCandidate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadResult_candidateId_key" ON "LeadResult"("candidateId");

-- CreateIndex
CREATE INDEX "LeadResult_runId_idx" ON "LeadResult"("runId");

-- CreateIndex
CREATE INDEX "LeadResult_leadScore_idx" ON "LeadResult"("leadScore");

-- CreateIndex
CREATE INDEX "LeadResult_createdAt_idx" ON "LeadResult"("createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_teamId_idx" ON "CreditLedger"("teamId");

-- CreateIndex
CREATE INDEX "CreditLedger_createdAt_idx" ON "CreditLedger"("createdAt");

-- AddForeignKey
ALTER TABLE "LeadCampaign" ADD CONSTRAINT "LeadCampaign_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCampaign" ADD CONSTRAINT "LeadCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPipelineRun" ADD CONSTRAINT "LeadPipelineRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "LeadCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPipelineLayerLog" ADD CONSTRAINT "LeadPipelineLayerLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LeadPipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCandidate" ADD CONSTRAINT "LeadCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LeadPipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResult" ADD CONSTRAINT "LeadResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "LeadCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResult" ADD CONSTRAINT "LeadResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LeadPipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

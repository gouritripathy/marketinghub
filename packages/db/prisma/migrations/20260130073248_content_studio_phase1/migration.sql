-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER', 'REVIEWER');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentOutputType" AS ENUM ('DRAFT', 'POST', 'INSIGHT', 'IMAGE_PROMPT');

-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('BRAND', 'LEGAL', 'MANAGER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('USER', 'TEAM', 'GLOBAL');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('VOICE', 'RULE', 'CTA', 'PROOF', 'FAQ', 'PATTERN', 'AVOID');

-- CreateEnum
CREATE TYPE "ContentGoal" AS ENUM ('BLOG', 'LANDING', 'CASE_STUDY', 'WHITEPAPER', 'LINKEDIN', 'EMAIL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContentDraftStatus" AS ENUM ('DRAFTING', 'IN_REVIEW', 'FINAL');

-- CreateEnum
CREATE TYPE "ContentDraftVersionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FINAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "contextJson" JSONB,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOutput" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "AgentOutputType" NOT NULL,
    "content" TEXT NOT NULL,
    "metaJson" JSONB,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "outputId" TEXT NOT NULL,
    "stage" "ApprovalStage" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "type" "MemoryType" NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "contentGoal" "ContentGoal" NOT NULL,
    "topic" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "status" "ContentDraftStatus" NOT NULL DEFAULT 'DRAFTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "inputSnapshotJson" JSONB NOT NULL,
    "briefJson" JSONB NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "outputJson" JSONB NOT NULL,
    "humanReadable" TEXT NOT NULL,
    "status" "ContentDraftVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDraftVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentApprovalFeedback" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stage" "ApprovalStage" NOT NULL,
    "reviewerId" TEXT,
    "comments" TEXT,
    "decision" "ContentApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentApprovalFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptPattern" (
    "id" TEXT NOT NULL,
    "contentGoal" "ContentGoal" NOT NULL,
    "persona" TEXT NOT NULL,
    "promptSnapshotJson" JSONB NOT NULL,
    "inputSignatureJson" JSONB NOT NULL,
    "formatStyle" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_createdAt_idx" ON "Team"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_userId_idx" ON "AgentRun"("userId");

-- CreateIndex
CREATE INDEX "AgentRun_teamId_idx" ON "AgentRun"("teamId");

-- CreateIndex
CREATE INDEX "AgentRun_agentKey_idx" ON "AgentRun"("agentKey");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentOutput_runId_idx" ON "AgentOutput"("runId");

-- CreateIndex
CREATE INDEX "AgentOutput_createdAt_idx" ON "AgentOutput"("createdAt");

-- CreateIndex
CREATE INDEX "Approval_outputId_idx" ON "Approval"("outputId");

-- CreateIndex
CREATE INDEX "Approval_reviewerId_idx" ON "Approval"("reviewerId");

-- CreateIndex
CREATE INDEX "Approval_createdAt_idx" ON "Approval"("createdAt");

-- CreateIndex
CREATE INDEX "MemoryItem_ownerUserId_idx" ON "MemoryItem"("ownerUserId");

-- CreateIndex
CREATE INDEX "MemoryItem_ownerTeamId_idx" ON "MemoryItem"("ownerTeamId");

-- CreateIndex
CREATE INDEX "MemoryItem_createdAt_idx" ON "MemoryItem"("createdAt");

-- CreateIndex
CREATE INDEX "MemoryItem_tags_idx" ON "MemoryItem" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "ContentDraft_createdByUserId_idx" ON "ContentDraft"("createdByUserId");

-- CreateIndex
CREATE INDEX "ContentDraft_contentGoal_idx" ON "ContentDraft"("contentGoal");

-- CreateIndex
CREATE INDEX "ContentDraft_status_idx" ON "ContentDraft"("status");

-- CreateIndex
CREATE INDEX "ContentDraft_createdAt_idx" ON "ContentDraft"("createdAt");

-- CreateIndex
CREATE INDEX "ContentDraftVersion_draftId_idx" ON "ContentDraftVersion"("draftId");

-- CreateIndex
CREATE INDEX "ContentDraftVersion_status_idx" ON "ContentDraftVersion"("status");

-- CreateIndex
CREATE INDEX "ContentDraftVersion_createdAt_idx" ON "ContentDraftVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDraftVersion_draftId_versionNumber_key" ON "ContentDraftVersion"("draftId", "versionNumber");

-- CreateIndex
CREATE INDEX "ContentApprovalFeedback_versionId_idx" ON "ContentApprovalFeedback"("versionId");

-- CreateIndex
CREATE INDEX "ContentApprovalFeedback_reviewerId_idx" ON "ContentApprovalFeedback"("reviewerId");

-- CreateIndex
CREATE INDEX "ContentApprovalFeedback_createdAt_idx" ON "ContentApprovalFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "PromptPattern_contentGoal_idx" ON "PromptPattern"("contentGoal");

-- CreateIndex
CREATE INDEX "PromptPattern_createdAt_idx" ON "PromptPattern"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOutput" ADD CONSTRAINT "AgentOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "AgentOutput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraftVersion" ADD CONSTRAINT "ContentDraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApprovalFeedback" ADD CONSTRAINT "ContentApprovalFeedback_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContentDraftVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApprovalFeedback" ADD CONSTRAINT "ContentApprovalFeedback_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

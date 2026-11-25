-- AlterTable
ALTER TABLE "disciplinary_actions" ADD COLUMN     "isReversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;

-- AlterTable
ALTER TABLE "project_milestones" ADD COLUMN     "achievedById" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "weightPoints" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "task_weight_verifications" ADD COLUMN     "consensusStatus" TEXT,
ADD COLUMN     "decisionAt" TIMESTAMP(3),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "voteDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sweep_runs" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "counts" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sweep_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sweep_runs_year_weekNumber_idx" ON "sweep_runs"("year", "weekNumber");

-- CreateIndex
CREATE INDEX "task_weight_verifications_consensusStatus_idx" ON "task_weight_verifications"("consensusStatus");


-- CreateEnum
CREATE TYPE "TaskWeightCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'CRITICAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WeightApprovalStatus" AS ENUM ('PENDING_CHRO', 'APPROVED', 'MODIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PROVISIONAL', 'CONFIRMED', 'CONFIRMED_BY_TIMEOUT');

-- CreateEnum
CREATE TYPE "SquadAssignmentContext" AS ENUM ('MAIN_SQUAD', 'OUTSIDE_SQUAD', 'DIRECT_EXECUTIVE');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "lifetimeXp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "task_weight_verifications" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "milestoneId" TEXT,
    "proposedWeight" DECIMAL(5,2) NOT NULL,
    "approvedWeight" DECIMAL(5,2),
    "category" "TaskWeightCategory" NOT NULL DEFAULT 'MEDIUM',
    "status" "WeightApprovalStatus" NOT NULL DEFAULT 'PENDING_CHRO',
    "context" "SquadAssignmentContext" NOT NULL DEFAULT 'MAIN_SQUAD',
    "proposerId" TEXT NOT NULL,
    "chroId" TEXT,
    "rejectionReason" TEXT,
    "chroNotes" TEXT,
    "isMassiveXp" BOOLEAN NOT NULL DEFAULT false,
    "massiveXpFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_weight_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "task_weight_consensus_votes" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "executiveId" TEXT NOT NULL,
    "executiveRole" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_weight_consensus_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "weekly_kpi_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "isInactive" BOOLEAN NOT NULL DEFAULT false,
    "inactivityPenaltyPending" BOOLEAN NOT NULL DEFAULT false,
    "inactivityPenaltyApplied" BOOLEAN NOT NULL DEFAULT false,
    "roleLevel" INTEGER NOT NULL DEFAULT 1,
    "evaluationStatus" "EvaluationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "pmScore" DECIMAL(5,2),
    "ctoScore" DECIMAL(5,2),
    "cpoScore" DECIMAL(5,2),
    "cfoScore" DECIMAL(5,2),
    "chroScore" DECIMAL(5,2),
    "evaluationBreakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_kpi_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "kpi_xp_audit_logs" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "prevHash" TEXT,
    "entryHash" TEXT,
    "employeeId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "deltaValue" DECIMAL(8,2) NOT NULL,
    "resultingTotal" DECIMAL(10,2),
    "actionType" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "taskId" TEXT,
    "authorizedById" TEXT,
    "authorizedRole" TEXT NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_xp_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "task_weight_verifications_taskId_key" ON "task_weight_verifications"("taskId");
CREATE UNIQUE INDEX IF NOT EXISTS "task_weight_verifications_milestoneId_key" ON "task_weight_verifications"("milestoneId");
CREATE INDEX IF NOT EXISTS "task_weight_verifications_status_idx" ON "task_weight_verifications"("status");
CREATE INDEX IF NOT EXISTS "task_weight_verifications_proposerId_idx" ON "task_weight_verifications"("proposerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "task_weight_consensus_votes_verificationId_executiveId_key" ON "task_weight_consensus_votes"("verificationId", "executiveId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_kpi_records_employeeId_year_weekNumber_key" ON "weekly_kpi_records"("employeeId", "year", "weekNumber");
CREATE INDEX IF NOT EXISTS "weekly_kpi_records_employeeId_year_idx" ON "weekly_kpi_records"("employeeId", "year");
CREATE INDEX IF NOT EXISTS "weekly_kpi_records_evaluationStatus_idx" ON "weekly_kpi_records"("evaluationStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kpi_xp_audit_logs_employeeId_createdAt_idx" ON "kpi_xp_audit_logs"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "kpi_xp_audit_logs_metricType_createdAt_idx" ON "kpi_xp_audit_logs"("metricType", "createdAt");
CREATE INDEX IF NOT EXISTS "kpi_xp_audit_logs_sequence_idx" ON "kpi_xp_audit_logs"("sequence");

-- AddForeignKey
ALTER TABLE "task_weight_verifications" ADD CONSTRAINT "task_weight_verifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_weight_verifications" ADD CONSTRAINT "task_weight_verifications_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_weight_verifications" ADD CONSTRAINT "task_weight_verifications_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_weight_verifications" ADD CONSTRAINT "task_weight_verifications_chroId_fkey" FOREIGN KEY ("chroId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_weight_consensus_votes" ADD CONSTRAINT "task_weight_consensus_votes_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "task_weight_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_weight_consensus_votes" ADD CONSTRAINT "task_weight_consensus_votes_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_kpi_records" ADD CONSTRAINT "weekly_kpi_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_xp_audit_logs" ADD CONSTRAINT "kpi_xp_audit_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpi_xp_audit_logs" ADD CONSTRAINT "kpi_xp_audit_logs_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-Only Immutability Triggers
DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_immutable ON "kpi_xp_audit_logs";
CREATE TRIGGER trg_kpi_xp_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "kpi_xp_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_no_truncate ON "kpi_xp_audit_logs";
CREATE TRIGGER trg_kpi_xp_audit_logs_no_truncate
BEFORE TRUNCATE ON "kpi_xp_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

REVOKE TRUNCATE ON "kpi_xp_audit_logs" FROM PUBLIC;

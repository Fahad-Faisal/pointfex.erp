-- CreateEnum
CREATE TYPE "TaskWeightStatus" AS ENUM ('PENDING_CHRO_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('MAIN_SQUAD', 'OUTSIDE_SQUAD', 'ISOLATED_EXECUTIVE');

-- CreateEnum
CREATE TYPE "ExecRole" AS ENUM ('CTO', 'CPO', 'CFO', 'CHRO');

-- CreateEnum
CREATE TYPE "ExecScoreStatus" AS ENUM ('UNREAD', 'CONFIRMED', 'ADJUSTED');

-- AlterTable
ALTER TABLE "allowlist_email_requests" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "external_identities" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kpi_xp_audit_logs" ADD COLUMN     "effectiveAt" TIMESTAMP(3),
ADD COLUMN     "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "valueAfter" DECIMAL(10,2),
ADD COLUMN     "valueBefore" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "login_allowlist" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "effectiveAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" "TaskOrigin" NOT NULL DEFAULT 'MAIN_SQUAD',
ADD COLUMN     "pmScore" DECIMAL(5,2),
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedById" TEXT,
ADD COLUMN     "weightCategory" "TaskWeightCategory" DEFAULT 'MEDIUM',
ADD COLUMN     "weightPoints" DECIMAL(5,2),
ADD COLUMN     "weightStatus" "TaskWeightStatus" NOT NULL DEFAULT 'PENDING_CHRO_VERIFICATION';

-- AlterTable
ALTER TABLE "weekly_kpi_records" ADD COLUMN     "weekStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "xp_ledger_entries" ADD COLUMN     "effectiveAt" TIMESTAMP(3),
ADD COLUMN     "entryHash" TEXT,
ADD COLUMN     "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'POSTED';

-- CreateTable
CREATE TABLE "task_weight_configs" (
    "id" TEXT NOT NULL,
    "category" "TaskWeightCategory" NOT NULL,
    "points" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_weight_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_configs" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "massiveXpThreshold" INTEGER NOT NULL DEFAULT 200,
    "inactivityPenalty" DECIMAL(4,2) NOT NULL DEFAULT 0.10,
    "mainSquadMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    "outsideSquadMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    "isolatedExecMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "devPmWeight" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "devCtoWeight" DECIMAL(3,2) NOT NULL DEFAULT 0.15,
    "devCpoWeight" DECIMAL(3,2) NOT NULL DEFAULT 0.15,
    "devCfoWeight" DECIMAL(3,2) NOT NULL DEFAULT 0.10,
    "devChroWeight" DECIMAL(3,2) NOT NULL DEFAULT 0.10,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_exec_scores" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "execRole" "ExecRole" NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "status" "ExecScoreStatus" NOT NULL DEFAULT 'UNREAD',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_exec_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_exec_evaluations" (
    "id" TEXT NOT NULL,
    "weeklyKpiRecordId" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "suggestedScore" DECIMAL(5,2),
    "status" "ExecScoreStatus" NOT NULL DEFAULT 'UNREAD',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_exec_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inactivity_penalties" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "appliedToTaskId" TEXT,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inactivity_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deductionPoints" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceDocId" TEXT NOT NULL,
    "appliedByChroId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplinary_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backfill_windows" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "grantedRole" TEXT NOT NULL DEFAULT 'pm',
    "createdById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backfill_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_annotations" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_weight_configs_category_key" ON "task_weight_configs"("category");

-- CreateIndex
CREATE INDEX "task_exec_scores_taskId_idx" ON "task_exec_scores"("taskId");

-- CreateIndex
CREATE INDEX "task_exec_scores_status_idx" ON "task_exec_scores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_exec_scores_taskId_execRole_key" ON "task_exec_scores"("taskId", "execRole");

-- CreateIndex
CREATE INDEX "kpi_exec_evaluations_weeklyKpiRecordId_idx" ON "kpi_exec_evaluations"("weeklyKpiRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_exec_evaluations_weeklyKpiRecordId_evaluatorRole_key" ON "kpi_exec_evaluations"("weeklyKpiRecordId", "evaluatorRole");

-- CreateIndex
CREATE INDEX "inactivity_penalties_userId_weekStart_idx" ON "inactivity_penalties"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "inactivity_penalties_userId_consumed_idx" ON "inactivity_penalties"("userId", "consumed");

-- CreateIndex
CREATE INDEX "disciplinary_actions_userId_weekStart_idx" ON "disciplinary_actions"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "disciplinary_actions_userId_createdAt_idx" ON "disciplinary_actions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "backfill_windows_grantedRole_isActive_idx" ON "backfill_windows"("grantedRole", "isActive");

-- CreateIndex
CREATE INDEX "audit_annotations_auditLogId_idx" ON "audit_annotations"("auditLogId");

-- CreateIndex
CREATE INDEX "audit_annotations_authorId_idx" ON "audit_annotations"("authorId");

-- CreateIndex
CREATE INDEX "kpi_xp_audit_logs_employeeId_recordedAt_idx" ON "kpi_xp_audit_logs"("employeeId", "recordedAt");

-- CreateIndex
CREATE INDEX "tasks_weightStatus_idx" ON "tasks"("weightStatus");

-- CreateIndex
CREATE INDEX "tasks_effectiveAt_idx" ON "tasks"("effectiveAt");

-- CreateIndex
CREATE INDEX "tasks_recordedAt_idx" ON "tasks"("recordedAt");

-- CreateIndex
CREATE INDEX "weekly_kpi_records_employeeId_weekStart_idx" ON "weekly_kpi_records"("employeeId", "weekStart");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_employeeId_recordedAt_idx" ON "xp_ledger_entries"("employeeId", "recordedAt");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_status_idx" ON "xp_ledger_entries"("status");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_weight_configs" ADD CONSTRAINT "task_weight_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_configs" ADD CONSTRAINT "kpi_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_exec_scores" ADD CONSTRAINT "task_exec_scores_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_exec_scores" ADD CONSTRAINT "task_exec_scores_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_exec_evaluations" ADD CONSTRAINT "kpi_exec_evaluations_weeklyKpiRecordId_fkey" FOREIGN KEY ("weeklyKpiRecordId") REFERENCES "weekly_kpi_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_exec_evaluations" ADD CONSTRAINT "kpi_exec_evaluations_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inactivity_penalties" ADD CONSTRAINT "inactivity_penalties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inactivity_penalties" ADD CONSTRAINT "inactivity_penalties_appliedToTaskId_fkey" FOREIGN KEY ("appliedToTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_actions" ADD CONSTRAINT "disciplinary_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_actions" ADD CONSTRAINT "disciplinary_actions_appliedByChroId_fkey" FOREIGN KEY ("appliedByChroId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backfill_windows" ADD CONSTRAINT "backfill_windows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_annotations" ADD CONSTRAINT "audit_annotations_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "kpi_xp_audit_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_annotations" ADD CONSTRAINT "audit_annotations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Check Constraints
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pm_score_check" CHECK ("pmScore" IS NULL OR ("pmScore" >= 0 AND "pmScore" <= 100));
ALTER TABLE "task_exec_scores" ADD CONSTRAINT "task_exec_scores_score_check" CHECK ("score" >= 0 AND "score" <= 100);
ALTER TABLE "kpi_exec_evaluations" ADD CONSTRAINT "kpi_exec_evaluations_score_check" CHECK ("score" >= 0 AND "score" <= 100);
ALTER TABLE "disciplinary_actions" ADD CONSTRAINT "disciplinary_actions_deduction_check" CHECK ("deductionPoints" > 0 AND "deductionPoints" <= 100);

-- ============================================================================
-- APPEND-ONLY ENFORCEMENT TRIGGERS (Database-Level Policy Protection)
-- ============================================================================

-- Ensure the immutable prevent_append_only_mutation function exists
CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Append-only ledger violation: % operation on % is strictly forbidden by Pointfex Governance Policy', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

-- 1. kpi_xp_audit_logs: Disallow UPDATE, DELETE, TRUNCATE
DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_immutable ON "kpi_xp_audit_logs";
CREATE TRIGGER trg_kpi_xp_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "kpi_xp_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_no_truncate ON "kpi_xp_audit_logs";
CREATE TRIGGER trg_kpi_xp_audit_logs_no_truncate
BEFORE TRUNCATE ON "kpi_xp_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

REVOKE TRUNCATE ON "kpi_xp_audit_logs" FROM PUBLIC;

-- 2. xp_ledger_entries: Disallow UPDATE, DELETE, TRUNCATE
DROP TRIGGER IF EXISTS trg_xp_ledger_entries_immutable ON "xp_ledger_entries";
CREATE TRIGGER trg_xp_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON "xp_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_xp_ledger_entries_no_truncate ON "xp_ledger_entries";
CREATE TRIGGER trg_xp_ledger_entries_no_truncate
BEFORE TRUNCATE ON "xp_ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

REVOKE TRUNCATE ON "xp_ledger_entries" FROM PUBLIC;

-- 3. audit_annotations: Disallow UPDATE, DELETE, TRUNCATE (Annotations are strictly append-only)
DROP TRIGGER IF EXISTS trg_audit_annotations_immutable ON "audit_annotations";
CREATE TRIGGER trg_audit_annotations_immutable
BEFORE UPDATE OR DELETE ON "audit_annotations"
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_audit_annotations_no_truncate ON "audit_annotations";
CREATE TRIGGER trg_audit_annotations_no_truncate
BEFORE TRUNCATE ON "audit_annotations"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_mutation();

REVOKE TRUNCATE ON "audit_annotations" FROM PUBLIC;

-- ============================================================================
-- DOCUMENTED ROLLBACK SQL FOR TRIGGERS (In case of emergency DB maintenance):
-- ----------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_immutable ON "kpi_xp_audit_logs";
-- DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_no_truncate ON "kpi_xp_audit_logs";
-- DROP TRIGGER IF EXISTS trg_xp_ledger_entries_immutable ON "xp_ledger_entries";
-- DROP TRIGGER IF EXISTS trg_xp_ledger_entries_no_truncate ON "xp_ledger_entries";
-- DROP TRIGGER IF EXISTS trg_audit_annotations_immutable ON "audit_annotations";
-- DROP TRIGGER IF EXISTS trg_audit_annotations_no_truncate ON "audit_annotations";
-- ============================================================================

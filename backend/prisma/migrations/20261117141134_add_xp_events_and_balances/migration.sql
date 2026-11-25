-- CreateEnum
CREATE TYPE "XpEventType" AS ENUM ('AWARD_PENDING', 'VERIFY_RELEASE', 'FREEZE', 'RELEASE_FROZEN', 'REVERSAL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "xp_ledger_entries" ADD COLUMN     "correlation_id" TEXT,
ADD COLUMN     "event_type" "XpEventType",
ADD COLUMN     "reverses_entry_id" TEXT,
ADD COLUMN     "task_id" TEXT;

-- CreateTable
CREATE TABLE "xp_balances" (
    "user_id" TEXT NOT NULL,
    "posted_xp" INTEGER NOT NULL DEFAULT 0,
    "pending_xp" INTEGER NOT NULL DEFAULT 0,
    "frozen_xp" INTEGER NOT NULL DEFAULT 0,
    "by_category_json" JSONB,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xp_balances_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "xp_ledger_entries_employeeId_sequence_idx" ON "xp_ledger_entries"("employeeId", "sequence");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_task_id_idx" ON "xp_ledger_entries"("task_id");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_correlation_id_idx" ON "xp_ledger_entries"("correlation_id");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_event_type_idx" ON "xp_ledger_entries"("event_type");

-- CreateIndex
CREATE INDEX "xp_ledger_entries_reverses_entry_id_idx" ON "xp_ledger_entries"("reverses_entry_id");

-- AddForeignKey
ALTER TABLE "xp_ledger_entries" ADD CONSTRAINT "xp_ledger_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger_entries" ADD CONSTRAINT "xp_ledger_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "xp_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_balances" ADD CONSTRAINT "xp_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce unique gap-free sequence per employee for event rows (sequence > 0)
CREATE UNIQUE INDEX IF NOT EXISTS "xp_ledger_entries_employee_sequence_uniq"
ON "xp_ledger_entries"("employeeId", "sequence")
WHERE "sequence" > 0;

# Pointfex KPI & XP System — Phase 1 Migration Notes & Data Remediation Plan

**Date:** 17 November 2026  
**Migration ID:** `20261117134343_add_kpi_xp_system_phase1`  
**Governing Standard:** CHRO Memorandum (12 Nov 2026) & Master Product Architecture  

---

## 1. Summary of Database Schema Additions

### 1.1 Extended Existing Tables (Strictly Additive)
- **`tasks`**:
  - `weightCategory` (`TaskWeightCategory` enum: `SMALL`, `MEDIUM`, `LARGE`, `CRITICAL`, `CUSTOM`, default `MEDIUM`)
  - `weightPoints` (`Decimal(5, 2)`, nullable)
  - `weightStatus` (`TaskWeightStatus` enum: `PENDING_CHRO_VERIFICATION`, `VERIFIED`, `REJECTED`, default `PENDING_CHRO_VERIFICATION`)
  - `origin` (`TaskOrigin` enum: `MAIN_SQUAD`, `OUTSIDE_SQUAD`, `ISOLATED_EXECUTIVE`, default `MAIN_SQUAD`)
  - `proposedById` (`String`, FK to `employees.id`, nullable)
  - `verifiedById` (`String`, FK to `employees.id`, nullable)
  - `pmScore` (`Decimal(5, 2)`, check constraint: `0 <= pmScore <= 100`, nullable)
  - `completedAt` (`TIMESTAMP(3)`, nullable)
  - `effectiveAt` (`TIMESTAMP(3)`, default `CURRENT_TIMESTAMP`)
  - `recordedAt` (`TIMESTAMP(3)`, default `CURRENT_TIMESTAMP`)
  - `isBackfilled` (`Boolean`, default `false`)
  - Indexes: `tasks_weightStatus_idx`, `tasks_effectiveAt_idx`, `tasks_recordedAt_idx`.

- **`weekly_kpi_records`**:
  - `weekStart` (`TIMESTAMP(3)`, nullable)
  - Indexes: `weekly_kpi_records_employeeId_weekStart_idx`.

- **`kpi_xp_audit_logs`**:
  - `valueBefore` (`Decimal(10, 2)`, nullable)
  - `valueAfter` (`Decimal(10, 2)`, nullable)
  - `effectiveAt` (`TIMESTAMP(3)`, nullable)
  - `recordedAt` (`TIMESTAMP(3)`, default `CURRENT_TIMESTAMP`)
  - `isBackfilled` (`Boolean`, default `false`)
  - Indexes: `kpi_xp_audit_logs_employeeId_recordedAt_idx`.

- **`xp_ledger_entries`**:
  - `status` (`String`, default `'POSTED'`, values: `PENDING`, `FROZEN`, `POSTED`, `REVERSED`)
  - `effectiveAt` (`TIMESTAMP(3)`, nullable)
  - `recordedAt` (`TIMESTAMP(3)`, default `CURRENT_TIMESTAMP`)
  - `isBackfilled` (`Boolean`, default `false`)
  - `prevHash` (`String`, nullable)
  - `entryHash` (`String`, nullable)
  - `sequence` (`Int`, default `0`)
  - Indexes: `xp_ledger_entries_employeeId_recordedAt_idx`, `xp_ledger_entries_status_idx`.

### 1.2 New Tables Added
1. **`task_weight_configs`**: Configurable default weight points (`SMALL`=1, `MEDIUM`=2, `LARGE`=3, `CRITICAL`=5), seeded with defaults and editable only by CHRO/CEO.
2. **`kpi_configs`**: Singleton configuration table storing:
   - `massiveXpThreshold` (default `200`)
   - `inactivityPenalty` (default `0.10`)
   - Context multipliers: `mainSquadMultiplier` (`1.00`), `outsideSquadMultiplier` (`0.70`), `isolatedExecMultiplier` (`0.50`)
   - Level 1 evaluation weights: `devPmWeight` (`0.50`), `devCtoWeight` (`0.15`), `devCpoWeight` (`0.15`), `devCfoWeight` (`0.10`), `devChroWeight` (`0.10`)
3. **`task_exec_scores`**: Tracks provisional and confirmed per-task C-Level read receipts (`CTO`, `CPO`, `CFO`, `CHRO`) with status `UNREAD`, `CONFIRMED`, `ADJUSTED`. Unique on `(taskId, execRole)`.
4. **`kpi_exec_evaluations`**: Tracks weekly component evaluations for PMs, C-Level, and CEO with the same read-receipt pattern. Unique on `(weeklyKpiRecordId, evaluatorRole)`.
5. **`inactivity_penalties`**: Tracks queued 10% penalties (`userId`, `weekStart`, `appliedToTaskId`, `consumed`, `consumedAt`). Indexed on `(userId, weekStart)` and `(userId, consumed)`.
6. **`disciplinary_actions`**: Tracks formal CHRO/CEO KPI deductions (`userId`, `deductionPoints`, `reason`, `referenceDocId`, `appliedByChroId`, `weekStart`). Check constraint: `0 < deductionPoints <= 100`.
7. **`backfill_windows`**: Stores active backfill grace windows (`startsAt`, `endsAt`, `grantedRole`, `isActive`).
8. **`audit_annotations`**: Stores non-mutating CHRO notes linking to immutable audit logs (`auditLogId`, `authorId`, `note`, `createdAt`).

---

## 2. Append-Only Trigger Implementation & Rollback SQL

### 2.1 Active PostgreSQL Trigger
The migration installs a database-level trigger on `kpi_xp_audit_logs`, `xp_ledger_entries`, and `audit_annotations`:
```sql
CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Append-only ledger violation: % operation on % is strictly forbidden by Pointfex Governance Policy', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

-- Applied BEFORE UPDATE OR DELETE on:
-- 1. kpi_xp_audit_logs
-- 2. xp_ledger_entries
-- 3. audit_annotations
```

### 2.2 Rollback SQL
In the event that an emergency database maintenance procedure is sanctioned by the CEO:
```sql
DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_immutable ON "kpi_xp_audit_logs";
DROP TRIGGER IF EXISTS trg_kpi_xp_audit_logs_no_truncate ON "kpi_xp_audit_logs";
DROP TRIGGER IF EXISTS trg_xp_ledger_entries_immutable ON "xp_ledger_entries";
DROP TRIGGER IF EXISTS trg_xp_ledger_entries_no_truncate ON "xp_ledger_entries";
DROP TRIGGER IF EXISTS trg_audit_annotations_immutable ON "audit_annotations";
DROP TRIGGER IF EXISTS trg_audit_annotations_no_truncate ON "audit_annotations";
```

---

## 3. Audit Defect Remediation & Phase 3 Roadmap

### 3.1 Resolving `PATCH /api/performance/audit-log/:id`
- **Defect:** Modifying existing audit log entries via `PATCH /api/performance/audit-log/:id` directly violated the append-only invariant.
- **Remediation Strategy (Phase 3):**
  - Deprecate `PATCH /api/performance/audit-log/:id`.
  - Provide `POST /api/performance/audit-log/:id/annotate` which inserts a row into `audit_annotations`.
  - Frontend `KpiXpAuditLedgerTable` displays existing annotations alongside the original entry.

### 3.2 Dynamic Config Elimination of Hardcodes
- The hardcoded check `approvedWeight >= 50` (500 XP) and the context multiplier multiplication against XP yield will be removed in Phase 3 by referencing `kpi_configs.massiveXpThreshold` (default 200 XP) and computing XP strictly as `verifiedWeightPoints * 10`.

---

## 4. CHRO-Approved Data Remediation Plan for Multiplier XP Rows

Existing XP ledger entries that were erroneously scaled by squad context multipliers (`0.70` or `0.50`) must be corrected **without deleting or rewriting existing rows**.

### Planned Correction Steps (Idempotent Script for Phase 3):
1. **Query Affected Completed Tasks:** Identify tasks approved with context `OUTSIDE_SQUAD` or `DIRECT_EXECUTIVE` where the disbursed XP was `Math.round(weight * multiplier * 10)` instead of `weight * 10`.
2. **Post Reversal Entry:**
   - Create an `XpLedgerEntry` with `entryType = 'REVERSAL'`, `delta = -originalYield`, `reversalOfId = originalEntryId`, `reason = 'Reversal of context-discounted XP entry per CHRO memorandum'`.
3. **Post Verified XP Award Entry:**
   - Create an `XpLedgerEntry` with `entryType = 'AWARD'`, `delta = verifiedWeightPoints * 10`, `reason = 'Corrected pure weight XP yield (10x verified weight)'`.
4. **Append Cryptographic Audit Trail:**
   - Append paired lines to `KpiXpAuditLog` with valid SHA-256 hash linkage.
5. **Adjust `Employee.lifetimeXp`:**
   - Increment `Employee.lifetimeXp` by `(verifiedWeightPoints * 10 - originalYield)`.


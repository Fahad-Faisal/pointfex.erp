# Pointfex KPI & XP Governance Suite — System Audit Report

**Date:** 17 November 2026  
**Auditor:** Senior Full-Stack Engineering Agent  
**Context:** Monorepo (`backend` NestJS + TypeScript + Prisma + PostgreSQL/Neon, `frontend` React 19 + Vite + Tailwind)  
**Governing Standard:** CHRO Memorandum (12 Nov 2026) & Master Implementation Specification  

---

## 1. Executive Summary

A partial implementation labelled `v3.14.0 "KPI & XP Governance Suite"` exists in the repository. While foundational structures (such as `task_weight_verifications`, `weekly_kpi_records`, `kpi_xp_audit_logs`, and basic SVG chart widgets) were created, the implementation contains critical security violations, formula divergences, stubbed logic, and architectural contradictions against the prompt requirements.

Most critically, the existing codebase introduced an audit log mutation route (`PATCH /api/performance/audit-log/:id`) which violates the core invariant of an append-only, tamper-proof cryptographic ledger. Furthermore, XP yields were incorrectly computed using context multipliers (rather than pure `verifiedWeightPoints * 10`), default weights diverged from the specification (Medium was 3 instead of 2; Critical was 10 instead of 5), and the backfill grace window and C-level read-receipt task score tracking were not implemented.

---

## 2. What Exists

### 2.1 Backend Models (`backend/prisma/schema.prisma`)
- `Task`: Basic task tracking (`id`, `title`, `description`, `projectId`, `milestoneId`, `creatorId`, `assigneeId`, `status`, `dueDate`, `estimatedHours`, `loggedHours`, `tags`).
- `TaskSubmission`: Submission of work (`prUrl`, `demoUrl`, `notes`, `status`, `feedback`, `reviewedById`).
- `TaskComment`: Discussion and review comments.
- `TaskWeightVerification`: Weight approval record linking to task/milestone with `proposedWeight`, `approvedWeight`, `category`, `status`, `context`, `proposerId`, `chroId`, `isMassiveXp`, `massiveXpFrozen`.
- `TaskWeightConsensusVote`: Executive voting on massive XP verification.
- `WeeklyKpiRecord`: Employee weekly score record (`weekNumber`, `year`, `score`, `isInactive`, `inactivityPenaltyPending`, `inactivityPenaltyApplied`, `roleLevel`, `evaluationStatus`, `pmScore`, `ctoScore`, `cpoScore`, `cfoScore`, `chroScore`, `evaluationBreakdown`).
- `KpiXpAuditLog`: Chained audit entries (`sequence`, `prevHash`, `entryHash`, `employeeId`, `metricType`, `deltaValue`, `resultingTotal`, `actionType`, `triggerEvent`, `authorizedById`, `authorizedRole`, `reason`).
- `XpLedgerEntry`: Basic XP record (`delta`, `reason`, `entryType`, `reversalOfId`, `awardedById`, `approvalRequestId`).

### 2.2 Backend Services & Controllers
- `ChroGovernanceController` (`backend/src/performance/chro-governance.controller.ts`): Weight queue, verify weight, apply disciplinary deduction, consensus voting, executive pending reviews, get audit log, employee performance summary, on-demand calculation endpoints, propose weight, override record, and audit log update.
- `PerformanceController` (`backend/src/performance/performance.controller.ts`): Standard CRUD/evaluation routes.
- `KpiEngineService` (`backend/src/performance/kpi-engine.service.ts`): Calculation routines for Developer, PM, C-Level, and CEO weekly KPIs, hash-chaining audit logger, override engine.
- `TasksService` (`backend/src/tasks/tasks.service.ts`): Task approval, submission, checklist toggling, status updating, and inline XP awarding logic upon task completion.

### 2.3 Frontend Components & Pages
- `KpiXpWidgets.tsx` (`frontend/src/components/performance/KpiXpWidgets.tsx`):
  - `WeeklyKpiTrendGraph`: SVG trend chart supporting active points and red `N/A` inactivity indicators.
  - `LifetimeXpStackedChart`: XP progression bar with small/medium/large/critical breakdown.
  - `KpiXpAuditLedgerTable`: Responsive audit ledger table with delta indicators and inline editing modal.
- `ChroPerformancePage.tsx`: Weight verification queue, disciplinary deduction form, roster table.
- `DeveloperEarningsPage.tsx`: Integrates weekly KPI trend and XP progression widgets.
- `DynamicDashboardPage.tsx`: Integrates executive and developer summary widgets.

---

## 3. What Is Broken

1. **Audit Log Mutation (`PATCH /api/performance/audit-log/:id`)**:
   - **File:** `backend/src/performance/chro-governance.controller.ts` and `kpi-engine.service.ts` (lines 1456–1515).
   - **Bug:** Allows CHRO or CEO to modify existing audit log entries (`prisma.kpiXpAuditLog.update`).
   - **Impact:** Breaks cryptographic hash chain integrity and violates the strict hard constraint: *"All ledgers (KPI and XP) are APPEND-ONLY. Corrections are reversal/adjustment entries, never edits or deletes."*

2. **XP Yield Calculation Applies Context Multiplier**:
   - **File:** `backend/src/tasks/tasks.service.ts` (lines 400–430) and `kpi-engine.service.ts` (lines 660–678).
   - **Bug:** XP yield calculated as `Math.round(baseApprovedWeight * squadMultiplier * 10)`.
   - **Impact:** Context multipliers (`MAIN_SQUAD=1.0`, `OUTSIDE_SQUAD=0.7`, `ISOLATED_EXECUTIVE=0.5`) belong *exclusively* to the Weekly KPI calculation. The prompt states: *"XP yield = verifiedWeightPoints * 10, exactly. XP does NOT depend on the satisfaction score. KPI does."*

3. **Inactivity Return Penalty Applied to XP Instead of Task KPI Score**:
   - **File:** `backend/src/tasks/tasks.service.ts` (lines 417, 490–509).
   - **Bug:** Deducts 10% of the task's XP yield (`effectiveWeight * 0.9` and negative XP audit log entry).
   - **Impact:** The inactivity penalty applies to the **task KPI score** (multiplied by 0.90 on next evaluated task), NOT as an XP penalty. XP is an unbounded volume metric that never takes an inactivity penalty.

4. **Timezone Calculation Divergence**:
   - **File:** `backend/src/performance/kpi-engine.service.ts` (lines 1518–1531).
   - **Bug:** `getWeekStartDate` uses JavaScript `new Date(year, 0, ...)` in host/server local time.
   - **Impact:** Fails prompt requirement: *"Timezone for all week boundaries and the backfill window: Asia/Dhaka (UTC+6). Week = Monday 00:00 to Sunday 23:59:59.999 Dhaka time. Store timestamps in UTC."*

5. **Massive XP Threshold Mismatch**:
   - **File:** `backend/src/performance/kpi-engine.service.ts` (line 645) & frontend (`ChroPerformancePage.tsx`).
   - **Bug:** Hardcoded check `approvedWeight >= 50` (500 XP).
   - **Impact:** Contradicts section 2.7 & section 12: *"Massive XP threshold (configurable, default 200 XP in one task): entry is FROZEN until a consensus C-Level approval is recorded"*.

---

## 4. What Is Stubbed / Missing

1. **Configurable Weight & KPI Tables (`TaskWeightConfig`, `KpiConfig`)**:
   - Missing tables to store weight point definitions and context multipliers dynamically. Default weights are hardcoded in enum/DTOs.
   - Seed default weights are wrong: Small=1, Medium=3, Large=5, Critical=10 instead of required: Small=1, Medium=2, Large=3, Critical=5.

2. **Per-Task Executive Scores (`TaskExecScore`)**:
   - Currently, executive scores are only mocked or provisionally stored at the *weekly* record level (`WeeklyKpiRecord.ctoScore`, etc.).
   - The specification requires provisional C-level scores generated **per completed task** upon PM review (`0.50*PM + 0.15*CTO + 0.15*CPO + 0.10*CFO + 0.10*CHRO`), with read-receipt states: `UNREAD`, `CONFIRMED`, `ADJUSTED`.

3. **PM Satisfaction Score on Review**:
   - `tasks.controller.ts` `POST :id/approve` accepts `feedback` and `payoutAmount`, but lacks explicit `pmScore` (0 to 100).
   - Tasks default to a static grade of `90` in `kpi-engine.service.ts` (line 129).

4. **Backfill Grace Window (`BackfillWindow`)**:
   - No `BackfillWindow` model or service exists.
   - No check enforcing the window cutoff `2026-11-19 23:59:59 (Asia/Dhaka)`.
   - No check restricting backfill to own squad members and excluding self-backfill.

5. **Leaderboard**:
   - No `LeaderboardPage` on frontend; no dedicated `/performance/leaderboard` endpoint with role/squad/period filtering and N/A markers.

6. **Dedicated C-Level Read-Receipt Inbox**:
   - C-level executives currently have no unified task evaluation inbox where UNREAD default scores are shown with one-click Read/Approve or adjust.

7. **Idempotent Weekly Cron Sweep**:
   - No automated cron endpoint (`/api/cron/sweep`) closing Dhaka weeks, marking `N/A` weeks, scheduling inactivity penalties, and verifying the SHA-256 hash chain.

---

## 5. What Contradicts the Prompt

| Feature | Existing Implementation | Specification Requirement |
| :--- | :--- | :--- |
| **Audit Modifications** | `PATCH /api/performance/audit-log/:id` mutates rows | **Strictly Forbidden.** All ledgers are APPEND-ONLY. Adjustments are reversal entries. |
| **XP Yield** | `baseApprovedWeight * squadMultiplier * 10` | `verifiedWeightPoints * 10, exactly`. Never multiplied by squad context. |
| **Default Weights** | Small=1, Medium=3, Large=5, Critical=10 | Small=1, Medium=2, Large=3, Critical=5; configurable in `TaskWeightConfig`. |
| **Massive XP Threshold** | 50 weight (500 XP) | 200 XP (configurable in `KpiConfig`). |
| **Inactivity Penalty Target** | Multiplied against XP yield | Applied to next evaluated **task score** (0.90x), never XP. |
| **Week Boundaries** | Server local time | Strictly **Asia/Dhaka (UTC+6)**: Monday 00:00 to Sunday 23:59:59.999. |
| **Task State Machine** | Status: `todo`, `in_progress`, `in_review`, `completed`, `blocked` | Formal state machine: `DRAFT -> ASSIGNED -> IN_PROGRESS -> IN_REVIEW -> COMPLETED` (or `RETURNED` / `CANCELLED`). |
| **Task Exec Scoring** | Done at weekly level only | Generated per completed task (`0.50*PM + 0.15*CTO + 0.15*CPO + 0.10*CFO + 0.10*CHRO`). |

---

## 6. Table & Endpoint Strategy: Reuse vs Replace

### 6.1 Database Models
- **`Task` (Reuse & Extend)**: Add `weightCategory`, `weightPoints`, `weightStatus`, `origin`, `proposedById`, `verifiedById`, `pmScore`, `completedAt`.
- **`TaskWeightConfig` (New Model)**: Configurable table for Small, Medium, Large, Critical default points.
- **`TaskWeightVerification` (Reuse & Extend)**: Maintain existing records; sync categories and points; ensure massive XP threshold is 200 XP.
- **`TaskExecScore` (New Model)**: Tracks per-task C-level read-receipt scores (`UNREAD`, `CONFIRMED`, `ADJUSTED`, `actedById`, `actedAt`, `reason`).
- **`WeeklyKpiRecord` (Reuse & Extend)**: Retain for weekly rollups, aligning status with `OFFICIAL`, `PROVISIONAL`, `NA`.
- **`KpiExecEvaluation` (New Model)**: Stores PM, C-Level, and CEO weekly component evaluations with read receipts.
- **`XpLedgerEntry` (Reuse & Extend)**: Ensure append-only status (`PENDING`, `FROZEN`, `POSTED`, `REVERSED`), `effectiveAt`, `recordedAt`, and ledger hash linkage.
- **`KpiXpAuditLog` (Reuse & Extend)**: Retain existing table and chain, add `isBackfilled`, `effectiveAt`, `recordedAt`, `valueBefore`, `valueAfter`. Revoke `UPDATE`/`DELETE`.
- **`BackfillWindow` (New Model)**: Tracks active grace window (`startsAt`, `endsAt`, `grantedRole`, `createdBy`).
- **`InactivityPenalty` (New Model)**: Tracks queued 10% penalty per user (`weekStart`, `appliedToTaskId`, `consumed`).
- **`DisciplinaryAction` (New Model)**: Formal records for CHRO/CEO deductions with MFA, reason, and doc reference.
- **`KpiConfig` (New Model)**: Dynamic key-value or structured config for context multipliers, massive XP threshold, and formulas.

### 6.2 Endpoints Strategy
- **Deprecate / Remove**: `PATCH /api/performance/audit-log/:id` (Audit log modification is deleted; replaced by append-only reversal/adjustment route).
- **Extend `tasks.controller.ts`**:
  - `POST /tasks`: Support weight proposal with category & origin (`MAIN_SQUAD`, `OUTSIDE_SQUAD`, `ISOLATED_EXECUTIVE`).
  - `POST /tasks/:id/submit-review`: Transition `IN_PROGRESS -> IN_REVIEW`.
  - `POST /tasks/:id/complete`: PM review requiring `pmScore` (0..100) and feedback; enforces SOD.
  - `POST /tasks/:id/return`: Return to `IN_PROGRESS` with feedback.
  - `POST /tasks/:id/cancel`: PM/Exec cancellation with audit reason.
  - `PATCH /tasks/:id/weight`: PM weight edit pre-verification.
  - `POST /tasks/:id/verify-weight`: CHRO approval, modification, or rejection.
- **Extend `chro-governance.controller.ts` & `performance.controller.ts`**:
  - Add `GET /performance/kpi/me` and `GET /performance/kpi/:userId` (scoped).
  - Add `GET /performance/xp/me` and `GET /performance/xp/:userId`.
  - Add `GET /performance/ledger/me` and `GET /performance/ledger/:userId`.
  - Add `GET /performance/leaderboard`.
  - Add `GET /performance/executive/task-scores/inbox` (UNREAD queue for CTO, CPO, CFO, CHRO).
  - Add `POST /performance/executive/task-scores/:id/confirm` & `adjust`.
  - Add `POST /performance/chro/disciplinary-deduction` (with fresh MFA & doc reference).
  - Add `POST /performance/backfill/task` (PM backfill with window check).
  - Add `GET /performance/backfill/status` & `POST /performance/backfill/window` (CHRO/CEO window management).
  - Add `POST /performance/xp/frozen/:id/vote` & `release`.
  - Extend `/api/cron/sweep` for weekly closes and chain verification.

---
**Audit Complete.** Proceed to SRS and Architecture design.


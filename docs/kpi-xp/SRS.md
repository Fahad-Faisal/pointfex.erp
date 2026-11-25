# Pointfex KPI & XP System — Software Requirements Specification (SRS)

**Standard:** CHRO Memorandum (12 Nov 2026) & Master Product Architecture  
**Timezone:** `Asia/Dhaka` (UTC+6)  
**Ledger Invariant:** Append-Only, Zero Update/Delete, Cryptographically Chained (SHA-256)  

---

## 1. System Overview & Core Definitions

### 1.1 Metrics
- **KPI (Key Performance Indicator):**
  - Weekly execution and quality efficiency metric.
  - Strictly bounded $[0, 100]$.
  - Computed per employee per calendar week (Monday 00:00:00 to Sunday 23:59:59.999 Asia/Dhaka time).
  - Evaluated hierarchically across 4 organizational levels: Level 1 (Developer), Level 2 (Project Manager), Level 3 (C-Level: CTO, CPO, CFO, CHRO), and Level 4 (CEO).
- **XP (Experience Points):**
  - Unbounded, cumulative, monotonic lifetime volume metric.
  - Calculated strictly as:
    $$\text{XP Yield} = \text{Verified Weight Points} \times 10$$
  - XP **does not depend** on PM satisfaction score or context multipliers. KPI does.
  - XP is posted to an append-only ledger once the task is `COMPLETED` and weight is `VERIFIED`.

### 1.2 Task Weight Hierarchy & Configuration
- Task weights determine XP yield and weight contribution in composite weekly KPI:
  - `SMALL`: 1 point (10 XP)
  - `MEDIUM`: 2 points (20 XP)
  - `LARGE`: 3 points (30 XP)
  - `CRITICAL`: 5 points (50 XP)
  - `CUSTOM`: $N$ points ($N \times 10$ XP), entered by PM and subject to mandatory CHRO verification.
- Defaults are stored in `TaskWeightConfig` and editable only by CHRO or CEO (`system:root`).

---

## 2. Task Lifecycle & State Machine

```
               [Create & Propose Weight (PM)]
                              │
                              ▼
                           [DRAFT]
                              │
                              ▼
                          [ASSIGNED]
                              │
                              ▼
                        [IN_PROGRESS] ◄────────────────────┐
                              │                            │
                     (submit_work)                         │
                              │                            │
                              ▼                            │
                         [IN_REVIEW]                       │
                        /           \                      │
          (PM review & score)    (Return with comment)     │
                      /               \                    │
                     ▼                 └───────────────────┘
                [COMPLETED]
                     │
         [Open State -> CANCELLED (PM/Exec with logged reason)]
```

### 2.1 State Transition Invariants
1. **DRAFT -> ASSIGNED:** PM assigns task to a developer and proposes weight (`category` or `CUSTOM` with points). Proposed weight status is `PENDING_CHRO_VERIFICATION`. Task records `origin`: `MAIN_SQUAD`, `OUTSIDE_SQUAD`, or `ISOLATED_EXECUTIVE`.
2. **CHRO Verification Gate:**
   - CHRO can `APPROVE`, `MODIFY`, or `REJECT` proposed weight at any time.
   - Developer may proceed to work while weight is pending.
   - If task completes while weight is `PENDING`, XP is created in status `PENDING` and auto-released upon CHRO verification.
   - **Self-Conflict (SOD):** Nobody verifies their own proposal. If CHRO creates/proposes a task as PM, verification authority routes strictly to CEO.
   - If CHRO modifies weight after XP has posted, the system posts a compensatory `XP_REVERSAL` entry followed by a new verified `XP_AWARD` entry.
3. **IN_PROGRESS -> IN_REVIEW:** Developer submits deliverable (requires `tasks:submit_work`, optional PR/Demo links).
4. **IN_REVIEW -> COMPLETED:**
   - PM performs review, enters mandatory **PM Satisfaction Score (0 to 100)** and review comments.
   - **SOD-TASK:** A PM can never review or complete their own task.
5. **IN_REVIEW -> RETURNED:** PM rejects deliverable; task transitions back to `IN_PROGRESS` with mandatory comment.
6. **ANY OPEN STATE -> CANCELLED:** PM or Executive cancels task with mandatory audit reason.

### 2.2 C-Level Read-Receipt Scoring Pipeline
Upon task completion:
1. System auto-generates 4 provisional `TaskExecScore` records for: CTO (15%), CPO (15%), CFO (10%), CHRO (10%).
2. **Default Score:** Set to the PM Satisfaction Score ("full marks relative to PM satisfaction").
3. **Status Flow:**
   - `UNREAD`: Visible in C-Level Inbox with an "Unread / Unconfirmed" badge. Provisional score contributes to developer's provisional KPI.
   - `CONFIRMED`: Executive presses "Read/Approve" without altering score.
   - `ADJUSTED`: Executive submits revised score ($0 \le S \le 100$) with a mandatory written justification.
4. When any executive confirms or adjusts, the developer's weekly KPI is automatically recomputed.
5. KPIs carry a distinct indicator: `PROVISIONAL` (if any executive score remains `UNREAD`) vs `OFFICIAL` (all signed off or week closed).

### 2.3 Massive XP Governance & Freezing
- **Threshold:** $\ge 200\text{ XP}$ (or task weight $\ge 20$ points), configurable via `KpiConfig.massiveXpThreshold`.
- **Action:** If an approved task yields $\ge 200\text{ XP}$, the XP ledger entry is posted with status `FROZEN`.
- **Release Condition:** Quorum of C-Suite executives: majority vote (at least 3 of CTO, CPO, CFO, CHRO) approving release.
- **CEO Override:** The CEO may unilaterally release frozen XP using 6-digit TOTP MFA and a logged reason.

> [!NOTE] Open Decision for CHRO
> With default standard task weights (Small=1, Medium=2, Large=3, Critical=5), the maximum standard task yield is 50 XP ($5 \times 10\text{ XP}$). Therefore, the 200 XP freeze threshold is only triggered for `CUSTOM` weights of 20+ points or high-weight milestones. The threshold is fully configurable via `KpiConfig.massiveXpThreshold` (default 200) should the CHRO choose to lower the boundary to capture standard Critical tasks.

### 2.4 Project Manager (L2) XP Rule
- PMs **never** receive XP from self-assigned or squad micro-tasks.
- PM XP derives solely from approved Project Milestones (`ProjectMilestone`).
- Milestone XP must be routed to C-Level / CEO approval before posting to the PM's XP ledger.

---

## 3. Mathematical Formulations

All mathematical logic is encapsulated in pure functions in `KpiEngineService`.

### 3.1 Developer (Level 1) KPI

#### Per-Task KPI Score
$$S_{\text{task}} = \left( 0.50 \times S_{\text{PM}} \right) + \left( 0.15 \times S_{\text{CTO}} \right) + \left( 0.15 \times S_{\text{CPO}} \right) + \left( 0.10 \times S_{\text{CFO}} \right) + \left( 0.10 \times S_{\text{CHRO}} \right)$$
If an inactivity penalty applies, the evaluated task score is multiplied by $0.90$ (10% reduction), applied once.

#### Weekly Composite KPI
$$\text{KPI}_{\text{Dev}} = \frac{\sum_{i=1}^{n} \left( S_{\text{task}, i} \times W_i \times M_i \right)}{\sum_{i=1}^{n} \left( W_i \times M_i \right)}$$
Where:
- $W_i$: Verified task weight points.
- $M_i$: Context multiplier:
  - `MAIN_SQUAD`: $1.00$
  - `OUTSIDE_SQUAD`: $0.70$
  - `ISOLATED_EXECUTIVE`: $0.50$
- Result is rounded to 2 decimal places and clamped to $[0, 100]$.

### 3.2 Project Manager (Level 2) Weekly KPI
$$\text{KPI}_{\text{PM}} = \left( 0.30 \times S_{\text{CTO}} \right) + \left( 0.30 \times S_{\text{CPO}} \right) + \left( 0.20 \times S_{\text{CFO}} \right) + \left( 0.20 \times S_{\text{CHRO}} \right)$$
- Evaluated weekly by the four functional executives with the same UNREAD/CONFIRMED/ADJUSTED read-receipt pattern.
- Auto-seeded with a suggested value calculated from squad outcomes:
  $$S_{\text{suggested}} = 0.50 \times \overline{\text{KPI}}_{\text{squad}} + 0.30 \times R_{\text{on-time}} + 0.20 \times R_{\text{blockers-resolved}}$$

### 3.3 C-Level Executive (Level 3) Weekly KPI
For CTO, CPO, CFO, CHRO:
$$\text{KPI}_{L3} = \left( 0.40 \times S_{\text{CompanyGoal}} \right) + \left( 0.30 \times S_{\text{DomainExecution}} \right) + \left( 0.20 \times S_{\text{CEOReview}} \right) + \left( 0.10 \times S_{\text{PeerSynergy}} \right)$$
- $S_{\text{DomainExecution}}$: Automatic average of the weekly KPIs of all PMs and squads under that executive's domain.
- $S_{\text{CompanyGoal}}$: Entered by CEO or CHRO.
- $S_{\text{CEOReview}}$: Entered by CEO.
- $S_{\text{PeerSynergy}}$: Average of cross-evaluations submitted by peer C-Suite officers (self-evaluations blocked).

### 3.4 CEO (Level 4) Weekly KPI
$$\text{KPI}_{\text{CEO}} = \left( 0.60 \times S_{\text{CompanyPerformance}} \right) + \left( 0.40 \times \overline{\text{KPI}}_{\text{C-Level}} \right)$$
- $\overline{\text{KPI}}_{\text{C-Level}}$: Automatic average of the 4 C-Level final weekly KPIs.
- $S_{\text{CompanyPerformance}}$: Entered by CHRO and confirmed by CEO with fresh MFA.

---

## 4. Inactivity & Disciplinary Rules

### 4.1 Inactivity Rule
- If a Developer or PM completes **zero** tasks/milestones during a Dhaka calendar week:
  - Weekly KPI is recorded as `null` (`isInactive = true`, status `NA`).
  - Represented on the trend graph as a red marker / banner.
  - Excluded from historical rolling averages (not treated as zero).
  - Queues an `InactivityPenalty` record: **$-10\%$ multiplicative reduction** on the next evaluated task ($S_{\text{task}} \times 0.90$).
  - Once applied to a subsequent task, the penalty is flagged `consumed = true` and logged as a dedicated audit line.
  - Leave / approved absence: CHRO can exempt an employee from inactivity flags with documented reason.

### 4.2 CHRO Disciplinary Deduction
- CHRO and CEO can deduct percentage points directly from an employee's weekly KPI.
- **Requirements:**
  1. Justification reason (minimum 10 characters).
  2. Document / grievance reference ID.
  3. Fresh TOTP MFA authentication.
- Posts as an adjustment entry in the KPI ledger, clamping score to $\ge 0$.

---

## 5. Backdating & Grace Window Governance

1. **Standard Invariant:** Backdating is strictly forbidden. Entries default to the real transaction time.
2. **Backfill Grace Window:**
   - Active until **2026-11-19 23:59:59 Asia/Dhaka (UTC+6)**.
   - Configured via `BackfillWindow` database record: `{ startsAt, endsAt, grantedRole: 'PM', createdBy }`.
   - Allows PMs to backfill past-dated tasks, submissions, weights, and reviews.
   - Scope: PMs may backfill only for developers in their assigned squads. Self-backfill is blocked.
3. **Post-Window Authority:**
   - After cutoff, only CHRO or CEO may submit backdated entries.
   - Requires fresh TOTP MFA and written justification.
4. **Audit Representation:**
   - Backfilled entries set `isBackfilled = true`.
   - Records both `effectiveAt` (backdated date) and `recordedAt` (actual server timestamp).
   - Affects weekly KPIs for historical weeks deterministically recomputed upon insertion.

---

## 6. Cryptographic Audit Log & Ledger Invariants

### 6.1 Cryptographic Chain (SHA-256)
$$H_n = \text{SHA256}\left( \text{seq}_n \parallel H_{n-1} \parallel \text{userId} \parallel \text{type} \parallel \text{delta} \parallel \text{effectiveAt} \parallel \text{recordedAt} \right)$$
- Sequence increments monotonically.
- Genesis hash: `0000000000000000000000000000000000000000000000000000000000000000`.
- Database triggers or role permissions reject `UPDATE` and `DELETE` on ledger tables.

### 6.2 Visibility Matrix
| Role | Own Logs | Squad Members | Company Wide | Leaderboard |
| :--- | :---: | :---: | :---: | :---: |
| **Developer** | Full Read | No | No | Full Read |
| **Project Manager** | Full Read | Full Read (assigned squads) | No | Full Read |
| **C-Level Executive** | Full Read | Full Read | Full Read | Full Read |
| **CEO** | Full Read | Full Read | Full Read | Full Read |

---

## 7. Permission Catalog & Roles

### Registered Permissions (Modules 16 & 17)
- `kpis:create`, `kpis:read`, `kpis:update`, `kpis:archive`, `kpis:assign`, `kpis:set_targets`, `kpis:configure_weights`, `kpis:calculate`, `kpis:approve_results`, `kpis:override_score` (⚠), `kpis:read_own`, `kpis:read_team`, `kpis:read_all`, `kpis:export`
- `xp:read_own`, `xp:read_team`, `xp:read_all`, `xp:read_ledger`, `xp:award`, `xp:deduct` (⚠), `xp:adjust`, `xp:approve_adjustment`, `xp:reverse`, `xp:freeze`, `xp:export`
- `leaderboards:read`
- `tasks:submit_work`, `tasks:approve`

### New Permissions Added
- `tasks:propose_weight`: PM weight proposal.
- `tasks:verify_weight`: CHRO weight decision.
- `kpis:score_exec`: C-Level read-receipt confirmation & adjustment.
- `kpis:discipline_deduct`: CHRO disciplinary deduction (⚠, MFA required).
- `kpis:backfill`: PM backfill within window.
- `kpis:backfill_override`: CHRO/CEO backfill override (⚠, MFA required).
- `kpis:read_squad_log`: PM squad audit access.
- `kpis:read_any_log`: C-Level universal audit inspection.
- `xp:release_frozen`: C-Level consensus release of massive XP.

---

## 8. REST API Specification

### Tasks & Weights
- `POST /api/tasks`: Create task with proposed weight (`category`, `proposedWeight`, `origin`).
- `PATCH /api/tasks/:id/weight`: Edit proposed weight (pre-verification).
- `POST /api/tasks/:id/verify-weight`: CHRO verify weight (`APPROVE`, `MODIFY`, `REJECT`).
- `POST /api/tasks/:id/submit-work`: Developer submits work.
- `POST /api/tasks/:id/complete`: PM review with `pmScore` (0..100) and feedback.
- `POST /api/tasks/:id/return`: Return task to in progress.
- `POST /api/tasks/:id/cancel`: Cancel task with reason.

### Executive Read-Receipt Scoring
- `GET /api/performance/executive/inbox`: List UNREAD scores for logged-in executive.
- `POST /api/performance/executive/task-scores/:id/confirm`: Confirm default score.
- `POST /api/performance/executive/task-scores/:id/adjust`: Adjust score with reason.

### Performance & Ledgers
- `GET /api/performance/kpi/me`: My current KPI & weekly series.
- `GET /api/performance/kpi/:userId`: Scoped KPI inspection.
- `GET /api/performance/xp/me`: My lifetime XP and category breakdown.
- `GET /api/performance/xp/:userId`: Scoped XP inspection.
- `GET /api/performance/ledger/me`: Paginated personal audit log.
- `GET /api/performance/ledger/:userId`: Scoped audit log.
- `GET /api/performance/leaderboard`: Leaderboard with filters (period, role, squad; KPI/XP sorting).
- `GET /api/performance/export`: CSV/JSON export.

### CHRO & Governance
- `POST /api/performance/chro/disciplinary-deduction`: Apply KPI deduction with MFA.
- `GET /api/performance/config`: Get system weights & thresholds.
- `PATCH /api/performance/config`: Update weight config & thresholds (CHRO/CEO).
- `GET /api/performance/backfill/status`: Check backfill window and countdown.
- `POST /api/performance/backfill/window`: Open/extend window (CHRO/CEO).
- `POST /api/performance/backfill/task`: Backfill task with past `effectiveAt`.
- `GET /api/performance/xp/frozen`: List frozen massive XP entries.
- `POST /api/performance/xp/frozen/:id/vote`: C-Level consensus vote.
- `POST /api/performance/xp/frozen/:id/override`: CEO supreme override.

### Cron
- `POST /api/cron/sweep`: Idempotent weekly closure, N/A detection, penalty queueing, chain verification.

---
**SRS Specification Approved.**


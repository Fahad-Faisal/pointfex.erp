# Changelog

## 4.2.0 (Production Release — November 2026) · Developed by ERP Team

### C-Suite Only Governance & Performance Reviews
- **Strict Role-Gated Governance Workspace**:
  - Gated the entire `admin_governance` workspace strictly to C-Suite executives (`CEO`, `CFO`, `CTO`, `CPO`, `CHRO`, and `system:root`).
  - Developers and Project Managers cannot see, switch to, or expand the Governance workspace in the sidebar rail or workspace switcher.
  - Performance Reviews (`#performance`) is strictly accessible only to C-Suite leadership (`CEO`, `CFO`, `CTO`, `CPO`, `CHRO`). Direct URL hash access by unauthorized roles immediately routes to `<AccessDeniedPage />`.
  - Removed all finance/budget sub-segments from Governance for non-C-Level users.
  - Delegated access quick-pill button in the sidebar is hidden for any user lacking delegation authority.

### Time-Bounded C-Level Delegations & Scoped Revocation
- **C-Level Exclusive Delegation Authority**:
  - Authority to create and assign delegations is strictly limited to C-Level executives (`CEO`, `CFO`, `CTO`, `CPO`, `CHRO`). Developers and PMs cannot create delegations.
  - **Hold-What-You-Delegate Law**: Non-CEO executives can strictly only delegate permissions they actively hold in their current authorization set, and cannot re-delegate permissions received through prior delegations.
  - **Scoped Revocation**: C-Level executives can only revoke delegations that they themselves created and assigned (`delegatorId === actor.id`).
  - **CEO Supreme Authority**: The CEO possesses supreme authority to delegate any operational permission and revoke any delegation organization-wide regardless of original assigner.

### CEO Supreme Approval & Automatic CHRO Bypass
- **Automatic Finalization on CEO Approval**:
  - When the CEO approves any task deliverable, verifies weight, or finalizes a submission, the task weight status is immediately set to `VERIFIED` and `TaskWeightVerification` transitions to `APPROVED`.
  - Bypasses subsequent CHRO verification requirements; XP ledger events disburse directly (`VERIFY_RELEASE` or `FREEZE`) without lingering in `AWARD_PENDING`.
  - CHRO Weight Queue filters out any tasks already approved, finalized, or verified by the CEO.

### Dynamic Navigation Deduplication
- **Zero Duplicate Segments**:
  - Filtered out 11 duplicate/auxiliary routes from visible workspace resolution: `idea-submissions`, `company-suggestions`, `approvals`, `budget-finance`, `my-performance`, `performance-ledger`, `performance-logs`, `approvals-control`, `projects-repos`, `task-management`, and `report`.
  - Every application feature now lives in exactly one canonical workspace segment.

### Real Database KPI Week Rendering & Chart Polish
- **Elimination of Synthetic Week Padding**:
  - Removed artificial placeholder weeks (`sample-1`..`sample-5` in `DynamicDashboardPage` and weeks 41–48 in `PmEarningsPage` and `CtoEarningsPage`).
  - Corrected KPI week labeling: clearly distinguishes between calendar week designation (e.g., `Week 46, 2026`) and total recorded weeks (e.g., `1 Week Recorded`).
  - Centered single-week data points dynamically on SVG trend curves.

### Database & Role Matrix Hardening
- Stripped inadvertent `mfa:manage` and delegation permissions from `developer` and `pm` roles in the RBAC matrix and database seeders.
- Granted `performance:read_all` and `performance:evaluate` to `cto`, `cfo`, and `cpo`.
- Purged all temporary test records and ensured clean developer role assignment.

## 4.1.0 (Production Release — November 2026) · Developed by ERP Team

### 6-Workspace Navigation Architecture & Role Scoping
- **Restructured Primary Workspaces**:
  - Consolidated platform into 6 streamlined workspaces:
    1. **Overview / Home** (`dashboard`): Dynamic KPI, squad delivery metrics, and quick directives.
    2. **Organization** (`organization`): Company directory, squads, projects, and member rosters.
    3. **My Work** (`my_workspace`): Interactive Kanban task management, personal squads, deliverable submissions, and leave requests.
    4. **Engineering** (`engineering_security`): Sprint code reviews, quality gates, test pipelines, deliverable submissions, and reports.
    5. **Advisory** (`consultancy_advisory`): Enterprise client consulting, proposal authoring, and peer consultation exchanges.
    6. **Governance** (`admin_governance`): Executive audit trail, access control, and C-Suite delegations.
- **Strict Role Gating for Governance**:
  - `Performance Reviews` (`performance`) and `Delegations` (`delegations`) strictly restricted to C-Suite executives (`CEO`, `CFO`, `CTO`, `CHRO`, `CPO` and `system:root`).
  - Developers and Project Managers cannot see or access Governance audit logs, delegations, or performance calibration consoles; access violations route cleanly to `<AccessDeniedPage />`.
  - Removed auxiliary duplicate sections (`FINANCE -> Budget Requests` and duplicate `APPROVALS -> Inbox & Approvals`) from the Governance sidebar.

### Time-Bounded Delegations & Hold-What-You-Delegate Policy
- **Executive Delegation Authority**:
  - Delegation capability strictly limited to C-Level executives and CEO.
  - Non-CEO executives (`CTO`, `CFO`, `CHRO`, `CPO`) can **strictly only delegate non-critical permissions they actively hold** in their own permission set (`availablePermissions`).
  - CEO exception: CEO possesses full company-wide delegative authority across all functional packs.
- **Revocation Scoping**:
  - C-Level executives can only revoke delegations that they themselves assigned/created (`delegatorId === currentUser.id`).
  - CEO possesses universal revocation authority across the entire organization.

### Personal Tasks & Squad Deliverables Workflow
- **My Tasks Interactive Kanban**:
  - Filtered strictly to deliverables assigned to the authenticated user (`assigneeId === currentUser.id`).
  - Drag-and-drop state transitions: `To Do` -> `In Progress` -> `In Review` -> `Completed` -> `Blocked`.
  - Task Weight & XP scaling: Supports 10, 30, 50, 100 pts and custom weight points mapping to 10x career XP yield.
- **Submissions & Leave Management**:
  - Multi-tab portal for leave notices, architecture/tooling ideas, company suggestions, and project deliverables.
  - Leave requests open to all personnel with custom duration and justification.
  - Formal approval gated strictly to CEO and CHRO.
  - **CEO Finalization Rule**: When approved by the CEO, leave requests and task weights are immediately finalized and verified; no further CHRO approval is required.

### Multi-Squad & Cross-Functional Allocation
- Squad management allows assigning members across all organizational personnel.
- Project Lead (PM) assignment dynamically reflects all project managers and C-Level executives.
- Synchronized multi-squad membership and deliverable tracking across backend and frontend models.

## 4.0.0 (Production Release — November 2026) · Developed by ERP Team

### Frontend Governance & View Synchronization
- **Strict Permission-View Sync (`nav-registry.ts`, `App.tsx`)**:
  - Fixed route permission leaking where users with `governance:read` or `delegations:create` could view `Roles & Permissions` (`access-control`).
  - Scoped `access-control` strictly to CEO and root administrators (`roles:read`, `roles:create`, `system:root`).
  - Prevented non-root executives (including CHRO) from accessing CEO Role Capability Matrix or triggering unauthorized permission catalog calls (`permissions:read`).
- **CHRO Performance Console & Pure KPI/XP Governance (`ChroPerformancePage.tsx`)**:
  - Removed all discretionary monetary inputs (`MoneyInput`, BDT cash bonuses and financial penalties) from the CHRO console. All executive citations strictly use Pointfex KPI & XP mechanics.
  - Recognition actions award Commendation Career XP (+10, +25, +50, +100 XP) into the immutable ledger.
  - Disciplinary actions enforce formal KPI Percentage Deductions ($1 \le p \le 100$) with mandatory documentation and cryptographic audit logs.
  - Added reactive local optimistic updates to immediately refresh staff roster scores upon recording quarterly performance evaluations.
- **Universal Company Leaderboard Access (`chro-governance.controller.ts`, `LeaderboardPage.tsx`)**:
  - Expanded permissions on `GET /api/performance/leaderboard` to `@RequireAnyPermission('leaderboards:read', 'tasks:read_own', 'tasks:read_squad', 'tasks:read_team', 'performance:read_all', 'profile:read')`, allowing every active employee to view standings.
  - Replaced error/`N/A` displays with clean `0.00` and `0 XP` metrics for new or inactive staff.
- **Enterprise Staff Roster & Clean Data Architecture**:
  - Purged all legacy dummy `@pointfex.internal` demo accounts, mock profiles, and unneeded profile columns from the database.
  - Bootstrapped exactly 1 verified CEO account with full MFA support and immutable `system:root` protection.
  - Enforced strict institutional domain filtering across employee directories, team rosters, and leaderboards.
- **CEO Role Creation MFA Alignment (`FreshMfaService`, `client.ts`)**:
  - Resolved MFA target mismatch (`code is bound to "new", not "global"`) by establishing target equivalence for new entity creation in `FreshMfaService` and setting `X-MFA-Target: global` in `client.ts`.
- **Design System, UX & Robustness (Stages A–C)**:
  - 100% token-based color system, unified component suite (`Button`, `Card`, `Modal`, `Tabs`, `DataTable`, `ErrorState`, `EmptyState`, etc.).
  - Global error boundaries, confirmation modals with destructive safeguards, and full mobile responsive views.
- **Frozen-XP Consensus Release (`FrozenXpConsensusService`)**:
  - Consensus request opened upon massive XP freeze ($\ge 200\text{ XP}$) with 7-day voting deadline.
  - Quorum threshold: strictly more than half of eligible active C-Suite seats (`CTO`, `CPO`, `CFO`, `CHRO`). Proposer PM and developer beneficiary excluded from voting.
  - Early rejection: automatically transitions to `REJECTED` and appends `REVERSAL` event when approvals can no longer reach threshold.
  - Expiry: automatically sweeps and appends `REVERSAL` so frozen XP never silently disappears or remains unposted.
  - Fresh MFA bound to request ID (`xp:release_frozen`) and double-voting strictly prohibited.
  - CEO supreme override: unilateral approve or reject with fresh MFA and logged reason.
- **PM Milestone XP Governance (`PmMilestoneXpService`)**:
  - Invariant strictly enforced: PMs NEVER earn micro-task XP from deliverables they assign or complete.
  - Milestone completion routes milestone XP (`weightPoints * 10`) to C-Level consensus approval request.
  - Released into posted XP upon consensus approval.
- **PM, C-Level, and CEO Weekly KPI Flows (`ExecWeeklyKpiService`)**:
  - PM `KpiExecEvaluation` workflow: system suggests scores from squad delivery metrics; CTO, CPO, CFO, CHRO confirm or adjust with justification; provisional flips to `CONFIRMED` upon all 4 reviews.
  - C-Level weekly: combines Company Goal, Domain Execution (auto-averaged from domain PMs), CEO review, and Peer Synergy (cross-evaluation, self-rating blocked).
  - CEO weekly: combines Company Performance input and auto C-Level aggregate.
- **Idempotent Weekly Cron Sweep (`WeeklySweepService` & `/api/cron/sweep`)**:
  - Protected by `CRON_SECRET`, logs execution into new `SweepRun` model.
  - Closes Dhaka week for all developers and PMs.
  - Flags zero-completion users as `NA` (reason `INACTIVE`) and queues exactly one `InactivityPenalty` (consumed FIFO on next deliverable, skipped for approved leaves).
  - Safety net: automatically releases `PENDING` XP whose weights became `VERIFIED`.
  - Runs cryptographic hash chain verification on XP ledger and audit log, and `reconcileBalances()` drift detection (alerts CHRO & CEO).
  - Dispatches 24h closing reminder notifications for active backfill windows.
- **CHRO Disciplinary Deduction (`DisciplinaryService`)**:
  - `POST /api/performance/disciplinary` (`kpis:discipline_deduct`): deducts $0 < p \le 100$ points with legal/HR reference document and reason, clamping weekly score at 0. Self-targeting strictly prohibited.
  - Negative KPI audit log event recorded with executive identity.
  - `POST /api/performance/disciplinary/:id/reverse`: reverses deduction with compensatory positive `REVERSAL` event and restores score. Never mutates or deletes rows.
- **Scoped Read APIs & Public Leaderboard (`PerformanceReadService`)**:
  - Paginated cursor-based ledger read (`/performance/ledger/me`, `/:userId`) scoped to own, PM squad members (`kpis:read_squad_log`), C-Level (`kpis:read_any_log`), and CHRO/CEO.
  - Audited CSV/JSON exports (`kpis:export`, `xp:export`).
  - Public leaderboard (`/performance/leaderboard`, `leaderboards:read`): deterministic ranking via pure `rankLeaderboard` across `latest_week`, `four_week_avg`, and `lifetime_xp`.
  - Strict data minimization: strips all private/sensitive fields (no emails, passwords, salaries, or internal component scores).
- **Testing & Quality Gates**:
  - 17/17 integration tests passing in `kpi-xp-phase4.spec.ts`.
  - 16/16 integration tests passing in `kpi-xp-phase3.spec.ts`.
  - 30/30 backend test suites passing (615 tests) and 19/19 frontend tests passing.
  - 100% test coverage maintained on pure `kpi-engine/` module with zero ignore comments.

## Phase 3: Task Lifecycle, CHRO Weight Gate, Event-Sourced XP Ledger & Executive Read-Receipts
- **Event-Sourced XP Ledger & Balance Projection**:
  - Implemented ADR-001 Option A: `xp_ledger_entries` modeled as immutable events (`AWARD_PENDING`, `VERIFY_RELEASE`, `FREEZE`, `RELEASE_FROZEN`, `REVERSAL`, `ADJUSTMENT`).
  - Added transaction-level PostgreSQL advisory locks (`pg_advisory_xact_lock(hashtext(userId))`) ensuring gap-free per-user sequencing and serialized cryptographic SHA-256 hash chaining under high concurrency.
  - Added mutable `xp_balances` projection table updated in-transaction with `rebuildBalance` and `reconcileBalances` drift detection.
  - Added legacy XP correction dry-run preview (`GET /api/performance/legacy-xp-corrections/preview`) and MFA-gated execution (`POST /api/performance/legacy-xp-corrections/apply`).
- **Server-Enforced Task Lifecycle State Machine**:
  - `TaskTransitionService` enforcing deterministic transitions across `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `IN_REVIEW`, `RETURNED`, `COMPLETED`, `CANCELLED`.
  - Prohibits transitions out of terminal states (`COMPLETED`, `CANCELLED`) and throws 409 Conflict with standard error schema on illegal transitions.
- **CHRO Weight Verification Gate & SOD**:
  - Added weight proposal (`POST /api/tasks/:id/propose-weight`) and CHRO verification (`POST /api/tasks/:id/verify-weight`).
  - SOD Self-Verification Block: strictly routes verification to CEO if CHRO proposed or created the deliverable.
  - Compensatory Reversal & Re-Award: modifies weight on completed tasks by posting compensatory `REVERSAL` event followed by verified `VERIFY_RELEASE`.
- **PM Approval & Executive Read-Receipt Scoring Pipeline**:
  - PM approval (`POST /api/tasks/:id/approve`): validates SOD-TASK (no self-approval), squad membership, FIFO consumes inactivity penalties, auto-generates 4 provisional `TaskExecScore` records (CTO 15%, CPO 15%, CFO 10%, CHRO 10%), and yields XP.
  - Executive review inbox (`GET /api/performance/exec-scores/inbox`) and action endpoints (`confirm`, `adjust`): enforces role-scoped access (e.g. CTO cannot act on CPO review), recalculates composite developer scores via pure engine, and flips weekly KPI status to `CONFIRMED` upon all executive sign-offs.
  - Asia/Dhaka time boundaries (`UTC+6`) consistently applied for week boundaries and backfill windows.
- **Testing & Verification**:
  - 16/16 comprehensive Phase 3 integration tests passing in `kpi-xp-phase3.spec.ts`.
  - 100% test coverage maintained on pure `kpi-engine/` module with zero ignore comments.
  - 29/29 backend test suites passing (598 tests) and 19/19 frontend tests passing.

## Version 3.14.0 (Pointfex KPI & XP Governance Suite)
- **Universal Executive Governance Gate**:
  - CEO Supreme Override: Strictly and only requires 6-digit MFA code; all text justification fields and secondary approvals bypassed.
  - CHRO Full Performance Authority: Complete access for CHRO (`2023200000066@seu.edu.bd`) to add, edit, adjust KPI & XP across the enterprise, and modify/annotate immutable audit log records via `PATCH /api/performance/audit-log/:id`.
  - C-Level (CTO, CFO, CPO) and PM Squad authority matrix with MFA verification.
  - Fixed internal server error on XP/KPI override by handling target employee alias resolution, robust role handling, and foreign key integrity.
- **UI/UX Modernization & Theme Alignment**:
  - Top Hero Section KPI Trend Graph with dynamic 0–100 execution curve and prominent red flag/indicator for N/A inactivity weeks.
  - Career XP Stacked Progression Bar mapping volume composition (Small 10 XP, Medium 30 XP, Large 50 XP, Critical 100 XP) and level progression.
  - Full dark-theme compatibility matching Pointfex ERP design tokens (`bg-[var(--surface)]`, `border-[var(--border)]`, `text-[var(--text)]`).
  - Removed XP/KPI cards from User Account/Profile (`MyAccountPage.tsx`) to keep profile focused on security and account credentials.
- **Auditing & Cryptographic Integrity**:
  - SHA-256 chained immutable audit ledger with inline audit entry editing for CHRO & CEO.
  - Comprehensive Jest tests (23 suites, 137 tests passing) and pristine TypeScript type safety.

## Release Candidate 1 (`release-candidate-1`)
- **Auth & Google OAuth**: Fixed `GET /api/auth/google` 302 redirect with PKCE + state + nonce, Vite `/api` proxy navigation, and friendly OAuth error screens.
- **CEO-Only Login Allowlist**: Added `login_allowlist`, `login_blocked_attempts`, `allowlist_email_requests`, default-deny enforcement (`LOGIN_ALLOWLIST_REQUIRED`), and Admin & Governance > **Login access** panel.
- **Allowlist-Driven Onboarding & Resend Mail**: Enforced allowlist-only employee creation, Resend welcome/reset/MFA-reset emails, delivery status tracking, rate-limited resend (`3/hr`), and removed temporary passwords from API responses and UI.
- **Always-MFA & CEO MFA Reset**: Enforced fresh single-use 6-digit TOTP (`X-MFA-Code`) on sensitive/executive mutations, privileged MFA reset rules, Admin & Governance > **Security** tab, and offline `npm run ceo:reset-mfa` CLI.
- **UI/UX & Security Hardening**: Unified **My Account** page, demo-free **LoginPage**, response sanitizer stripping `passwordHash`/`mfaSecret`/`mfaRecoveryCodes`/`temporaryPassword`, `backend/` & `frontend/` folder layout, `/api/health` & `/api/ready`, and updated deployment/security docs.


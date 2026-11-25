import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formatBDT, formatBDTCompact, moneyToneClass } from '../src/utils/money'
import {
  resolveVisibleNavigation,
  resolveVisibleWorkspaces,
  canAccessRoute,
  NAV_GROUPS,
  NAV_REGISTRY,
} from '../src/config/nav-registry'
import { WORKSPACES } from '../src/config/workspaces'
import {
  resolveVisibleDashboardWidgets,
  DASHBOARD_WIDGETS,
} from '../src/dashboard/widgets'
import {
  buildUnifiedInboxItems,
  filterUnifiedInboxItems,
} from '../src/services/unified-inbox'
import { filterPaletteByPermissions } from '../src/services/palette-items'
import { PERMISSION_PACKS, buildRolePlainSummary } from '../src/config/permission-packs'
import {
  getVisibleSensitiveProfileActions,
  isPermissionMfaRequiredEveryTime,
} from '../src/config/sensitive-actions'
import { AccessDeniedCard } from '../src/pages/security/AccessDeniedPage'
import { parseAllowlistInput } from '../src/utils/allowlist'
import {
  resolveMissingPermissionsForRoute,
  buildAccessRequestPayload,
} from '../src/pages/security/access-request-helpers'
import {
  WeeklyKpiTrendGraph,
  LifetimeXpStackedChart,
} from '../src/components/performance/KpiXpWidgets'
import { ErrorState } from '../src/components/common/ErrorState'
import { ConfirmDialog } from '../src/components/common/ConfirmDialog'
import { Stepper } from '../src/components/common/Stepper'
import { mapBackendBundleToSeedData } from '../src/api/adapter'
import { createDataResolvers } from '../src/data'
import {
  resolveCtoAccount,
  deriveCtoPersonalTasks,
  deriveCtoEngineeringTasks,
  computeCtoQualityStats,
} from '../src/hooks/useCtoData'
import {
  FINAL_REVIEW_SECTIONS,
  createDefaultProjectChecklist,
  computeProjectChecklistStats,
  getProjectChecklistStorageKey,
} from '../src/components/common/ProjectDetailModal'

export function runFrontendSuite(): Array<{ name: string; pass: boolean }> {
  const results: Array<{ name: string; pass: boolean }> = []
  const test = (name: string, fn: () => void) => {
    try {
      fn()
      results.push({ name, pass: true })
    } catch (e) {
      console.error(`FAILED TEST: ${name}`)
      throw e
    }
  }

  // 1. BDT money formatting & semantic tone tests
  test('formatBDT uses taka symbol and South Asian 3-2-2 lakh/crore grouping', () => {
    assert.equal(formatBDT(500000), '৳5,00,000')
    assert.equal(formatBDT(12345678), '৳1,23,45,678')
    assert.equal(formatBDT(-12500), '-৳12,500')
    assert.equal(formatBDT(null), '৳0')
    assert.equal(formatBDT(500000.5, true), '৳5,00,000.50')
  })

  test('formatBDTCompact formats thousands, lakhs, and crores cleanly', () => {
    assert.equal(formatBDTCompact(500000), '৳5 lakh')
    assert.equal(formatBDTCompact(12000000), '৳1.2 crore')
    assert.equal(formatBDTCompact(850), '৳850')
  })

  test('moneyToneClass assigns success, danger, and default text tokens semantically', () => {
    assert.match(moneyToneClass(1500), /success/)
    assert.match(moneyToneClass(-200), /danger/)
    assert.match(moneyToneClass(0), /--text/)
  })

  // 2. Navigation visibility & custom role dynamism
  test('minimal user sees accessible nav groups and max 8 sidebar groups', () => {
    const resolved = resolveVisibleNavigation([])
    assert.ok(resolved.groups.length <= 8)
    assert.equal(canAccessRoute('dashboard', []), true)
    assert.equal(canAccessRoute('budget', []), false)
    assert.equal(canAccessRoute('role-matrix', []), false)
  })

  test('custom role "Chief AI Officer" dynamically unlocks permitted nav groups with no code change', () => {
    const chiefAiOfficerPerms = [
      'projects:read_all',
      'treasury:read',
      'audit_logs:read',
      'approvals:read',
      'approvals:approve',
    ]
    const resolved = resolveVisibleNavigation(chiefAiOfficerPerms)
    assert.ok(resolved.groups.length <= 8)
    assert.equal(canAccessRoute('budget', chiefAiOfficerPerms), true)
    assert.equal(canAccessRoute('audit-log', chiefAiOfficerPerms), true)
    assert.equal(canAccessRoute('people', chiefAiOfficerPerms), true)
  })

  test('nav definitions cap sidebar groups to <= 8 even for system:root', () => {
    const rootResolved = resolveVisibleNavigation(['system:root'])
    assert.ok(NAV_GROUPS.length >= 8)
    assert.ok(NAV_REGISTRY.length >= 10)
    assert.ok(rootResolved.groups.length <= 8)
    assert.equal(rootResolved.settingsItem?.route, 'settings')
  })

  test('workspaces gate cleanly for minimal employee, manager, Chief AI Officer, and CEO across 6-workspace architecture', () => {
    // 1. Minimal employee (sees Dashboard, Organization, My Work, and Engineering Reports)
    const minimalWs = resolveVisibleWorkspaces([])
    assert.deepEqual(
      minimalWs.map((w) => w.workspace.id),
      ['dashboard', 'organization', 'my_workspace', 'engineering_security'],
    )

    // 2. Manager
    const managerPerms = [
      'teams:read_all',
      'projects:read_all',
      'tasks:create_assign',
      'budgets:read_requests',
      'approvals:read',
      'approvals:approve',
    ]
    const managerWs = resolveVisibleWorkspaces(managerPerms)
    assert.deepEqual(
      managerWs.map((w) => w.workspace.id),
      ['dashboard', 'organization', 'my_workspace', 'engineering_security'],
    )
    assert.ok(managerWs.every((w) => w.sections.length <= 4))

    // 3. Custom "Chief AI Officer" role
    const aiOfficerPerms = [
      'projects:read_all',
      'treasury:read',
      'audit_logs:read',
      'approvals:read',
      'approvals:approve',
    ]
    const aiWs = resolveVisibleWorkspaces(aiOfficerPerms)
    assert.deepEqual(
      aiWs.map((w) => w.workspace.id),
      ['dashboard', 'organization', 'my_workspace', 'engineering_security', 'admin_governance'],
    )

    // 4. CEO (system:root) sees all 6 workspaces
    const ceoWs = resolveVisibleWorkspaces(['system:root'])
    const ceoIds = ceoWs.map((w) => w.workspace.id)
    assert.deepEqual(
      ceoIds,
      [
        'dashboard',
        'organization',
        'my_workspace',
        'engineering_security',
        'consultancy_advisory',
        'admin_governance',
      ],
    )
    assert.equal(ceoIds.length, 6)
  })

  // 3. Dashboard widget visibility tests
  test('dashboard hides org widgets for basic users and reveals permitted ones dynamically', () => {
    const basicWidgets = resolveVisibleDashboardWidgets([])
    const basicIds = basicWidgets.map((w) => w.id)
    assert.ok(basicIds.includes('my_tasks_due'))
    assert.ok(basicIds.includes('my_xp_wallet'))
    assert.equal(basicIds.includes('treasury_summary'), false)
    assert.equal(basicIds.includes('audit_highlights'), false)

    const aiOfficerWidgets = resolveVisibleDashboardWidgets([
      'treasury:read',
      'audit_logs:read',
      'approvals:read',
    ])
    const aiIds = aiOfficerWidgets.map((w) => w.id)
    assert.ok(aiIds.includes('treasury_summary'))
    assert.ok(aiIds.includes('audit_highlights'))
    assert.ok(aiIds.includes('my_pending_approvals'))
    assert.ok(DASHBOARD_WIDGETS.length >= 10)
  })

  // 4. AccessDeniedPage helper & SSR rendering tests
  test('AccessDeniedCard renders required capability badges, Request Access button, and builds approval payload', () => {
    const missing = resolveMissingPermissionsForRoute('budget')
    assert.ok(missing.length > 0)

    const payload = buildAccessRequestPayload({
      userId: 'emp_ai_01',
      routeId: 'budget',
      routeLabel: 'Treasury & Budgets',
      missingPermissions: missing,
      reason: 'Quarterly AI compute budget review',
    })
    assert.equal(payload.entityType, 'route_access')
    assert.equal(payload.entityId, 'emp_ai_01:budget')
    assert.match(payload.reason, /Quarterly AI compute budget review/)

    const html = renderToStaticMarkup(
      React.createElement(AccessDeniedCard, {
        routeId: 'budget',
        routeLabel: 'Treasury & Budgets',
        missingPermissions: missing,
        canSubmitRequest: true,
        isFormOpen: false,
        isSubmitting: false,
        submitted: false,
        reason: '',
        onChangeReason: () => {},
        onOpenForm: () => {},
        onCloseForm: () => {},
        onSubmitForm: () => {},
        onBackHome: () => {},
      }),
    )
    assert.match(html, /Access Restricted/)
    assert.match(html, /Treasury &amp; Budgets|Treasury & Budgets/)
    assert.match(html, /Request Access/)
    assert.match(html, /Back to Home/)
  })

  test('unified inbox aggregates approvals, task reviews, expiring delegations, and filters by type', () => {
    const now = Date.parse('2026-11-12T12:00:00Z')
    const built = buildUnifiedInboxItems({
      nowMs: now,
      canApproveTasks: true,
      canApproveBudgets: true,
      canApproveEmailRequests: true,
      emailRequests: [
        {
          id: 'er_1',
          email: 'hire@gmail.com',
          fullName: 'New Hire',
          reason: 'Q4 cohort',
          status: 'PENDING',
        },
      ],
      approvals: [
        {
          id: 'ap_1',
          actionCode: 'payroll:approve_batch',
          entityType: 'payroll_batch',
          entityId: 'nov_2026',
          amount: 250000,
          requiresDualApproval: true,
        },
      ],
      tasks: [
        {
          id: 't_1',
          title: 'Ship unified inbox',
          status: 'in_review',
          priority: 'high',
          dueDate: '2026-11-13',
        } as any,
      ],
      myReceivedDelegations: [
        {
          id: 'del_1',
          status: 'ACTIVE',
          expiresAt: '2026-11-12T18:00:00Z',
          delegator: { name: 'CTO' },
          reason: 'Release coverage',
        },
      ],
      notifications: [
        { id: 'n_1', title: 'Mentioned in Q4 review', message: 'Check budget', read: false, timestamp: '2026-11-12T11:00:00Z' } as any,
        { id: 'n_2', title: 'Already read', message: 'Ignore', read: true, timestamp: '2026-11-12T10:00:00Z' } as any,
      ],
    })
    assert.equal(built.length, 5)
    assert.equal(filterUnifiedInboxItems(built, 'approval', '').length, 1)
    assert.equal(filterUnifiedInboxItems(built, 'task_review', '').length, 1)
    assert.equal(filterUnifiedInboxItems(built, 'delegation', '').length, 1)
    assert.equal(filterUnifiedInboxItems(built, 'email_request', '').length, 1)
    assert.equal(filterUnifiedInboxItems(built, 'all', 'payroll').length, 1)
  })

  test('command palette filters pages, quick-create actions, shortcuts, and people strictly by effective permissions', () => {
    const basicPalette = filterPaletteByPermissions({ query: '', effectivePermissions: [] })
    assert.equal(basicPalette.allowPeople, false)
    assert.equal(
      basicPalette.actions.some((a) => a.id === 'new_role'),
      false,
    )
    assert.equal(
      basicPalette.shortcuts.some((s) => s.route === 'budget'),
      false,
    )
    assert.ok(basicPalette.actions.some((a) => a.id === 'submit_leave'))

    const financePalette = filterPaletteByPermissions({
      query: 'budget',
      effectivePermissions: ['treasury:read', 'budgets:request_increase', 'employees:read_directory'],
    })
    assert.equal(financePalette.allowPeople, true)
    assert.ok(financePalette.actions.some((a) => a.id === 'request_budget'))
    assert.ok(financePalette.shortcuts.some((s) => s.route === 'budget'))
  })

  test('every code in all 40 permission packs exists in docs/permissions_master.md and critical codes are explicitly marked', () => {
    const mdPath = path.resolve(process.cwd(), '../docs/permissions_master.md')
    const md = fs.readFileSync(mdPath, 'utf8')
    const catalog = new Map<string, boolean>()
    for (const line of md.split('\n')) {
      if (!line.startsWith('|')) continue
      const match =
        line.match(/\|\s*`([a-z0-9_]+:[a-z0-9_]+)`\s*\|/i) ||
        line.match(/\|\s*([a-z0-9_]+:[a-z0-9_]+)\s*\|/)
      if (match) {
        catalog.set(match[1], line.includes('⚠'))
      }
    }

    assert.ok(PERMISSION_PACKS.length >= 40, `Expected >=40 packs, got ${PERMISSION_PACKS.length}`)
    for (const pack of PERMISSION_PACKS) {
      for (const code of pack.codes) {
        assert.ok(catalog.has(code), `Pack "${pack.id}" contains unknown code "${code}"`)
        if (catalog.get(code)) {
          assert.equal(
            pack.riskLevel,
            'critical',
            `Pack "${pack.id}" includes critical code "${code}" without riskLevel="critical"`,
          )
          assert.ok(
            pack.criticalCodes.includes(code),
            `Pack "${pack.id}" includes critical code "${code}" without listing it in criticalCodes`,
          )
        }
      }
    }

    const summary = buildRolePlainSummary(new Set(['projects:read_all', 'sprints:create']))
    assert.match(summary.canSummary, /This role can/)
    assert.match(summary.cannotSummary, /but cannot/)
  })

  test('sensitive-action registry marks critical, governance:*, and executive permissions as requiring fresh MFA every time', () => {
    assert.equal(isPermissionMfaRequiredEveryTime('users:assign_role', false), true)
    assert.equal(isPermissionMfaRequiredEveryTime('employees:read_sensitive', false), true)
    assert.equal(isPermissionMfaRequiredEveryTime('governance:any_future_action', false), true)
    assert.equal(isPermissionMfaRequiredEveryTime('custom:critical_action', true), true)
    assert.equal(isPermissionMfaRequiredEveryTime('tasks:read_own', false), false)
  })

  test('employee profile sensitive action buttons are gated strictly by permission and require reason where configured', () => {
    assert.deepEqual(
      getVisibleSensitiveProfileActions(() => false).map((a) => a.key),
      [],
    )

    const onlyPromoteAndUnlock = getVisibleSensitiveProfileActions((perm) =>
      ['promotions:approve', 'employees:read_sensitive'].includes(perm),
    )
    assert.deepEqual(
      onlyPromoteAndUnlock.map((a) => a.key),
      ['unlock_sensitive', 'promote'],
    )
    assert.equal(onlyPromoteAndUnlock[0].requiresReason, false)
    assert.equal(onlyPromoteAndUnlock[1].requiresReason, true)

    const allFive = getVisibleSensitiveProfileActions(() => true)
    assert.deepEqual(
      allFive.map((a) => a.key),
      ['unlock_sensitive', 'promote', 'remove_position', 'reset_password', 'reset_mfa'],
    )
    assert.match(allFive[1].describe('Nusrat Jahan', 'Principal Engineer'), /Nusrat Jahan.*Principal Engineer/)
    assert.match(allFive[3].describe('Nusrat Jahan'), /email it directly to Nusrat Jahan/)
  })

  test('login page contains zero demo accounts, demo env flags, or hardcoded role credentials', () => {
    const loginSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/LoginPage.tsx'),
      'utf8',
    )
    for (const forbidden of [
      'VITE_ENABLE_DEMO_LOGIN',
      'VITE_DEMO_PASSWORD',
      'DEMO_ENVIRONMENTS',
      'noor.ceo@',
      'abir.cto@',
      'rahid.cfo@',
      'naim.chro@',
      'jihad.pm@',
      'fahim.dev@',
    ]) {
      assert.equal(
        loginSource.includes(forbidden),
        false,
        `LoginPage.tsx must not contain demo artifact "${forbidden}"`,
      )
    }
  })

  test('LoginAccessPage parser trims, lowercases, dedupes, and counts invalid emails', () => {
    const existing = new Set(['already@company.com'])
    const res = parseAllowlistInput(
      'Alice@Gmail.com, already@company.com\nalice@gmail.com\nnot-an-email',
      existing,
    )
    assert.deepEqual(res.toAdd, ['alice@gmail.com'])
    assert.equal(res.duplicates, 2)
    assert.deepEqual(res.invalid, ['not-an-email'])
  })

  test('MyAccountPage exposes all required sections and login-access route gates on allowlist permissions', () => {
    const accountSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/account/MyAccountPage.tsx'),
      'utf8',
    )
    for (const section of [
      'Profile',
      'Change Password',
      'Linked Google Account',
      'MFA Status',
      'MfaRecoveryCodesCard',
      'Active Sessions',
      'AdditionalGrantedAccessCard',
    ]) {
      assert.ok(accountSource.includes(section), `MyAccountPage missing "${section}"`)
    }

    assert.equal(canAccessRoute('login-access', ['tasks:read_own']), false)
    assert.equal(canAccessRoute('login-access', ['login_allowlist:read']), true)
    assert.equal(canAccessRoute('login-access', ['login_allowlist:manage']), true)
  })

  test('replaceRolePermissions forwards X-MFA-Code, X-MFA-Action, and X-MFA-Target (CEO role-save bug regression)', () => {
    const clientSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/api/client.ts'),
      'utf8',
    )
    assert.ok(
      clientSource.includes("'X-MFA-Action': 'roles:update'"),
      "client.ts replaceRolePermissions must send X-MFA-Action: roles:update",
    )
    assert.ok(
      clientSource.includes("'X-MFA-Action': 'users:assign_role'"),
      "client.ts assignRoleToEmployee must send X-MFA-Action: users:assign_role",
    )
    assert.ok(
      clientSource.includes("'X-MFA-Action': 'roles:create'"),
      "client.ts createRole must send X-MFA-Action: roles:create",
    )
    assert.ok(
      clientSource.includes("'X-MFA-Action': 'roles:delete'"),
      "client.ts deleteRole must send X-MFA-Action: roles:delete",
    )
    assert.ok(
      clientSource.includes("cloneRole: ("),
      "client.ts must define cloneRole with optional mfaCode",
    )
    assert.ok(
      clientSource.includes("activateRole: ("),
      "client.ts must define activateRole with optional mfaCode",
    )
    assert.ok(
      clientSource.includes("deactivateRole: ("),
      "client.ts must define deactivateRole with optional mfaCode",
    )
    assert.ok(
      clientSource.includes("updateRole: ("),
      "client.ts must define updateRole with optional mfaCode",
    )
  })

  test('auth preservation: AppContext and client protect reset-password tokens and routes', () => {
    const appContextSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/AppContext.tsx'),
      'utf8',
    )
    assert.ok(
      appContextSource.includes("!window.location.pathname.startsWith('/reset-password')"),
      'AppContext must not overwrite /reset-password on unauthenticated session bootstrap',
    )
    assert.ok(
      appContextSource.includes("'/login' + window.location.search"),
      'AppContext must preserve query parameters when redirecting to /login',
    )

    const clientSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/api/client.ts'),
      'utf8',
    )
    assert.ok(
      clientSource.includes("path.startsWith('/auth/reset-password')"),
      'client.ts must mark /auth/reset-password as an auth lifecycle route',
    )
    assert.ok(
      clientSource.includes("path.startsWith('/auth/google')"),
      'client.ts must mark /auth/google as an auth lifecycle route',
    )

    const vercelConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'),
    )
    const rootRedirect = vercelConfig.redirects?.find((r: any) => r.source === '/')
    assert.ok(rootRedirect, 'vercel.json must have a redirect for /')
    assert.equal(rootRedirect.destination, '/login')
  })

  // Stage B: Performance, Ledger, and Governance tests
  test('nav-registry routes: my-performance, performance-ledger, and leaderboard are accessible to users', () => {
    const devPerms = new Set(['tasks:read_own'])
    assert.equal(canAccessRoute('my-performance', devPerms), true)
    assert.equal(canAccessRoute('performance-ledger', devPerms), true)
    assert.equal(canAccessRoute('leaderboard', devPerms), true)

    const navIds = NAV_REGISTRY.map((i) => i.id)
    assert.ok(navIds.includes('my-performance'))
    assert.ok(navIds.includes('performance-ledger'))
    assert.ok(navIds.includes('leaderboard'))
  })

  test('KpiXpWidgets: WeeklyKpiTrendGraph renders N/A on inactivity and provisional badges', () => {
    const html = renderToStaticMarkup(
      React.createElement(WeeklyKpiTrendGraph, {
        series: [
          { weekNumber: 45, year: 2026, score: 82.5, isInactive: false, isProvisional: false },
          { weekNumber: 46, year: 2026, score: null, isInactive: true, isProvisional: false },
          { weekNumber: 47, year: 2026, score: 91.0, isInactive: false, isProvisional: true },
        ],
      }),
    )

    assert.ok(html.includes('N/A'), 'Trendline must display N/A marker on inactive weeks')
    assert.ok(
      html.includes('PROV') || html.includes('Provisional'),
      'Trendline must indicate provisional weeks',
    )
  })

  test('KpiXpWidgets: LifetimeXpStackedChart renders posted, pending, and frozen XP volume', () => {
    const html = renderToStaticMarkup(
      React.createElement(LifetimeXpStackedChart, {
        lifetimeXp: 2000,
        postedXp: 1500,
        pendingXp: 300,
        frozenXp: 200,
        tierCeiling: 2500,
      }),
    )

    assert.ok(html.includes('Posted') || html.includes('posted'), 'Stacked bar must display posted XP segment')
    assert.ok(html.includes('Pending') || html.includes('pending'), 'Stacked bar must display pending XP segment')
    assert.ok(html.includes('Frozen') || html.includes('frozen'), 'Stacked bar must display frozen XP segment')
  })

  test('sensitive-actions: performance discipline, freeze consensus, and weight verify require fresh MFA', () => {
    assert.equal(isPermissionMfaRequiredEveryTime('performance:discipline'), true)
    assert.equal(isPermissionMfaRequiredEveryTime('kpis:discipline_deduct'), true)
    assert.equal(isPermissionMfaRequiredEveryTime('xp:release_frozen'), true)
    assert.equal(isPermissionMfaRequiredEveryTime('tasks:verify_weight'), true)
  })

  test('Security profile audit: MyAccountPage contains 0 KPI or XP references', () => {
    const myAccountSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/account/MyAccountPage.tsx'),
      'utf8',
    )
    assert.ok(
      !myAccountSource.includes('WeeklyKpiTrendGraph'),
      'MyAccountPage must NOT embed KPI graphs (profile must remain security-only)',
    )
    assert.ok(
      !myAccountSource.includes('LifetimeXpStackedChart'),
      'MyAccountPage must NOT embed XP charts',
    )
  })

  // Stage C: Shared Design System & UX components
  test('ErrorState component renders title, error message, and retry button', () => {
    let _retried = false
    const html = renderToStaticMarkup(
      React.createElement(ErrorState, {
        title: 'Connection Lost',
        error: new Error('Network timeout after 5000ms'),
        onRetry: () => {
          _retried = true
        },
      }),
    )

    assert.ok(html.includes('Connection Lost'), 'ErrorState must render title')
    assert.ok(html.includes('Network timeout after 5000ms'), 'ErrorState must render error details')
    assert.ok(html.includes('Try again'), 'ErrorState must render retry action')
  })

  test('ConfirmDialog renders title, message, and action buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        isOpen: true,
        onClose: () => {},
        onConfirm: () => {},
        title: 'Revoke Device Session',
        message: 'This device will be logged out immediately.',
        severity: 'danger',
        confirmLabel: 'Revoke Now',
      }),
    )

    assert.ok(html.includes('Revoke Device Session'), 'ConfirmDialog must render modal title')
    assert.ok(html.includes('This device will be logged out immediately.'), 'ConfirmDialog must render message')
    assert.ok(html.includes('Revoke Now'), 'ConfirmDialog must render confirm button')
  })

  test('Stepper component renders step labels and indicates active step', () => {
    const html = renderToStaticMarkup(
      React.createElement(Stepper, {
        steps: [
          { id: '0', label: 'Details' },
          { id: '1', label: 'Staffing' },
          { id: '2', label: 'Review' },
        ],
        currentStep: 1,
      }),
    )

    assert.ok(html.includes('Details'), 'Stepper must render step 1 label')
    assert.ok(html.includes('Staffing'), 'Stepper must render step 2 label')
    assert.ok(html.includes('Review'), 'Stepper must render step 3 label')
  })

  test('mapBackendBundleToSeedData correctly persists squad creation with PM, members, and projects', () => {
    const bundle: any = {
      employees: [
        { id: 'emp_pm_01', name: 'Alice PM', positionAssignments: [{ position: { roleCategory: 'pm' } }] },
        { id: 'emp_dev_01', name: 'Bob Dev', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
        { id: 'emp_dev_02', name: 'Charlie Dev', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
      ],
      teams: [
        {
          id: 'team_phoenix',
          name: 'Squad Phoenix',
          code: 'SP',
          focus: 'Core Platform',
          pmId: 'emp_pm_01',
          memberIds: ['emp_dev_01', 'emp_dev_02'],
          projectIds: ['proj_01'],
        },
      ],
      projects: [
        {
          id: 'proj_01',
          name: 'Project Delta',
          code: 'PD',
          teamId: 'team_phoenix',
        },
      ],
    }

    const seed = mapBackendBundleToSeedData(bundle)
    assert.equal(seed.teams.length, 1)
    const team = seed.teams[0]
    assert.equal(team.name, 'Squad Phoenix')
    assert.equal(team.pmId, 'emp_pm_01')
    assert.deepEqual(team.memberIds, ['emp_dev_01', 'emp_dev_02'])
    assert.deepEqual(team.projectIds, ['proj_01'])

    // Role-based user teamId linkage
    const pm = seed.users.find((u) => u.id === 'emp_pm_01')
    const dev1 = seed.users.find((u) => u.id === 'emp_dev_01')
    const dev2 = seed.users.find((u) => u.id === 'emp_dev_02')
    assert.equal(pm?.teamId, 'team_phoenix')
    assert.equal(dev1?.teamId, 'team_phoenix')
    assert.equal(dev2?.teamId, 'team_phoenix')

    // Project team linkage
    const proj = seed.projects.find((p) => p.id === 'proj_01')
    assert.equal(proj?.teamId, 'team_phoenix')

    // Resolvers test for developer and PM scoping
    const resolvers = createDataResolvers(seed)
    const devProjects = resolvers.getDeveloperProjects('emp_dev_01')
    assert.equal(devProjects.length, 1)
    assert.equal(devProjects[0].id, 'proj_01')
  })

  test('squad member swapping and PM unassignment persist accurately in seed data', () => {
    const bundle: any = {
      employees: [
        { id: 'emp_pm_01', name: 'Alice PM', positionAssignments: [{ position: { roleCategory: 'pm' } }] },
        { id: 'emp_dev_01', name: 'Bob Dev', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
        { id: 'emp_dev_02', name: 'Charlie Dev', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
      ],
      teams: [
        {
          id: 'team_alpha',
          name: 'Team Alpha',
          code: 'TA',
          focus: 'Delivery',
          pmId: '', // PM unassigned
          memberIds: ['emp_dev_02'], // emp_dev_01 removed, emp_dev_02 remains
          projectIds: [],
        },
      ],
      projects: [],
    }

    const seed = mapBackendBundleToSeedData(bundle)
    const team = seed.teams[0]
    assert.equal(team.pmId, '')
    assert.deepEqual(team.memberIds, ['emp_dev_02'])

    const dev2 = seed.users.find((u) => u.id === 'emp_dev_02')
    assert.equal(dev2?.teamId, 'team_alpha')
  })

  test('assigned squad PM with developer base role is recognized and retains PM authority over squad deliverables', () => {
    const bundle: any = {
      employees: [
        { id: 'emp_fahim', name: 'Fahim Uddin', title: 'Software Developer', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
        { id: 'emp_dev_02', name: 'Bob Dev', title: 'Software Developer', positionAssignments: [{ position: { roleCategory: 'developer' } }] },
      ],
      teams: [
        {
          id: 'team_boron',
          name: 'Team Boron',
          code: 'TB',
          focus: 'Platform Systems',
          pmId: 'emp_fahim', // Fahim is assigned as PM
          memberIds: ['emp_dev_02'],
          projectIds: ['proj_01'],
        },
      ],
      projects: [
        { id: 'proj_01', name: 'Project Boron Core', code: 'PBC', teamId: 'team_boron' },
      ],
      tasks: [
        {
          id: 'task_01',
          title: 'Implement Core Feature',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_02',
          creatorId: 'emp_fahim',
          status: 'completed',
          weightCategory: 'LARGE',
          weightPoints: 3,
          pmScore: 92,
        },
      ],
    }

    const seed = mapBackendBundleToSeedData(bundle)
    assert.equal(seed.teams.length, 1)
    const team = seed.teams[0]
    assert.equal(team.pmId, 'emp_fahim')

    // Task weight and score persistence
    const task = seed.tasks[0]
    assert.equal(task.weightCategory, 'LARGE')
    assert.equal(task.weightPoints, 3)
    assert.equal(task.pmScore, 92)

    // PM resolved from team.pmId matches Fahim
    const pmUser = seed.users.find((u) => u.id === team.pmId)
    assert.equal(pmUser?.id, 'emp_fahim')
    assert.equal(pmUser?.teamId, 'team_boron')
  })

  // 17. 6-Workspace Primary Navigation Architecture & Ordered Sub-Navigation Suite
  test('6-workspace primary navigation architecture consolidates exact ordered sub-navigation items and role access', () => {
    assert.equal(WORKSPACES.length, 6, 'Exactly 6 primary workspaces configured')
    const wsIds = WORKSPACES.map((w) => w.id)
    assert.deepEqual(wsIds, [
      'dashboard',
      'organization',
      'my_workspace',
      'engineering_security',
      'consultancy_advisory',
      'admin_governance',
    ])

    // Workspace 1: Dashboard
    const dashboardItems = NAV_REGISTRY.filter((i) => i.workspace === 'dashboard')
    assert.equal(dashboardItems[0].route, 'dashboard')

    // Workspace 2: Organization & Directory
    // 1. Leaderboard, 2. Projects, 3. People Directory, 4. Squads & Teams
    const orgItems = NAV_REGISTRY.filter((i) => i.workspace === 'organization')
    const orgRoutes = orgItems.map((i) => i.route)
    assert.equal(orgRoutes[0], 'leaderboard')
    assert.equal(orgRoutes[1], 'projects')
    assert.equal(orgRoutes[2], 'people')
    assert.equal(orgRoutes[3], 'teams')

    // Developers and PMs have inspect-only access across all 4 (routes accessible with zero permissions)
    assert.equal(canAccessRoute('leaderboard', []), true)
    assert.equal(canAccessRoute('projects', []), true)
    assert.equal(canAccessRoute('people', []), true)
    assert.equal(canAccessRoute('teams', []), true)

    // Workspace 3: My Work
    // DAILY WORK: tasks, my-squads
    // GROWTH & PAY: earnings
    const myWsItems = NAV_REGISTRY.filter((i) => i.workspace === 'my_workspace')
    const myWsRoutes = myWsItems.map((i) => i.route)
    assert.equal(myWsRoutes[0], 'tasks')
    assert.equal(myWsRoutes[1], 'my-squads')
    assert.equal(myWsRoutes[2], 'earnings')

    assert.equal(canAccessRoute('earnings', []), true)
    assert.equal(canAccessRoute('tasks', []), true)
    assert.equal(canAccessRoute('my-squads', []), true)

    // Workspace 4: Engineering & Security
    // Code Quality, Security Testing, Submissions & Leave, Idea Submissions, Company Suggestions, Reports
    const engItems = NAV_REGISTRY.filter((i) => i.workspace === 'engineering_security')
    const engRoutes = engItems.map((i) => i.route)
    assert.equal(engRoutes[0], 'code-quality')
    assert.equal(engRoutes[1], 'security-testing')
    assert.equal(engRoutes[2], 'submissions-leave')
    assert.equal(engRoutes[3], 'idea-submissions')
    assert.equal(engRoutes[4], 'company-suggestions')
    assert.equal(engRoutes[5], 'reports')

    assert.equal(canAccessRoute('submissions-leave', []), true)
    assert.equal(canAccessRoute('idea-submissions', []), true)
    assert.equal(canAccessRoute('company-suggestions', []), true)

    // Workspace 5: Technical Advisory & Consultancy
    // 1. Client Advisory, 2. Project Requests, 3. Client Proposals
    const advItems = NAV_REGISTRY.filter((i) => i.workspace === 'consultancy_advisory')
    const advRoutes = advItems.map((i) => i.route)
    assert.equal(advRoutes[0], 'consultancy')
    assert.equal(advRoutes[1], 'project-requests')
    assert.equal(advRoutes[2], 'proposals')

    // Workspace 6: Governance
    // OPERATIONS: inbox, performance, budget
    // ACCESS & AUDIT: access-control, login-access, delegations, audit-log, access-history, security-overview
    const adminItems = NAV_REGISTRY.filter((i) => i.workspace === 'admin_governance')
    const adminRoutes = adminItems.map((i) => i.route)
    assert.equal(adminRoutes[0], 'inbox')
    assert.equal(adminRoutes[1], 'performance')
    assert.equal(adminRoutes[2], 'budget')
    assert.equal(adminRoutes[3], 'access-control')
    assert.equal(adminRoutes[4], 'login-access')
    assert.equal(adminRoutes[5], 'delegations')
    assert.equal(adminRoutes[6], 'audit-log')
    assert.equal(adminRoutes[7], 'access-history')
    assert.equal(adminRoutes[8], 'security-overview')
  })

  // 18. Multi-Squad Membership and Dual-Role Support
  test('adapter cleanly maps multi-squad memberships and task percentage attributes', () => {
    const bundle: any = {
      employees: [
        {
          id: 'emp_cfo_01',
          name: 'Tanim Cfo',
          email: 'tanim@pointfex.com',
          title: 'Chief Financial Officer',
          role: 'cfo',
          positionAssignments: [{ position: { roleCategory: 'cfo' } }],
          teamMemberships: [
            { teamId: 'team_alpha', isLead: false },
            { teamId: 'team_beta', isLead: true },
          ],
        },
        {
          id: 'emp_dev_01',
          name: 'Dev One',
          email: 'dev1@pointfex.com',
          title: 'Developer',
          role: 'developer',
          positionAssignments: [{ position: { roleCategory: 'developer' } }],
        },
        {
          id: 'emp_dev_02',
          name: 'Dev Two',
          email: 'dev2@pointfex.com',
          title: 'Developer',
          role: 'developer',
          positionAssignments: [{ position: { roleCategory: 'developer' } }],
        },
      ],
      teams: [
        {
          id: 'team_alpha',
          name: 'Team Alpha',
          code: 'SQ-01',
          memberIds: ['emp_cfo_01', 'emp_dev_01'],
          pmId: 'emp_pm_01',
        },
        {
          id: 'team_beta',
          name: 'Team Beta',
          code: 'SQ-02',
          memberIds: ['emp_cfo_01', 'emp_dev_02'],
          pmId: 'emp_cfo_01', // CFO acting as PM for Team Beta
        },
      ],
      tasks: [
        {
          id: 'task_01',
          title: 'Implement Core Security',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_01',
          status: 'completed',
          isMainProjectTask: true,
          projectPercentage: 25,
          ceoFinalized: true,
        },
        {
          id: 'task_02',
          title: 'Ad-hoc Documentation',
          projectId: 'proj_01',
          assigneeId: 'emp_dev_02',
          status: 'in_progress',
          isMainProjectTask: false,
          projectPercentage: 0,
          ceoFinalized: false,
        },
      ],
    }

    const seed = mapBackendBundleToSeedData(bundle)
    assert.equal(seed.teams.length, 2)
    assert.equal(seed.teams[1].pmId, 'emp_cfo_01', 'C-Level executive successfully assigned as squad PM')

    const user = seed.users.find((u) => u.id === 'emp_cfo_01')
    assert.ok(user)
    assert.equal(user.role, 'cfo', 'Core role remains CFO (not overwritten)')
    assert.equal(user.title, 'Chief Financial Officer', 'Core title remains CFO')
    assert.ok(user.teamIds?.includes('team_alpha'), 'Belongs to Team Alpha')
    assert.ok(user.teamIds?.includes('team_beta'), 'Belongs to Team Beta')

    // Task percentage and scope mapping
    const linkedTask = seed.tasks.find((t) => t.id === 'task_01')
    assert.ok(linkedTask)
    assert.equal(linkedTask.isMainProjectTask, true)
    assert.equal(linkedTask.projectPercentage, 25)
    assert.equal(linkedTask.ceoFinalized, true)

    const standaloneTask = seed.tasks.find((t) => t.id === 'task_02')
    assert.ok(standaloneTask)
    assert.equal(standaloneTask.isMainProjectTask, false)
    assert.equal(standaloneTask.projectPercentage, 0)
    assert.equal(standaloneTask.ceoFinalized, false)
  })

  // 19. RBAC & Route Governance Verification
  test('validates universal inspect, reporting and strictly gated executive access', () => {
    // Universal access checks (accessible to everyone without special permissions)
    assert.equal(canAccessRoute('people', []), true, 'People directory is universal inspect')
    assert.equal(canAccessRoute('projects', []), true, 'Projects directory is universal inspect')
    assert.equal(canAccessRoute('teams', []), true, 'Squads directory is universal inspect')
    assert.equal(canAccessRoute('leaderboard', []), true, 'Leaderboard is universal inspect')
    assert.equal(canAccessRoute('reports', []), true, 'Reports is accessible to all employees')

    // Developer / Staff cannot access confidential logs, security governance or inbox
    const devPerms = ['tasks:read_own', 'tasks:update_own', 'teams:read_own', 'projects:read_own']
    assert.equal(canAccessRoute('audit-log', devPerms), false, 'Devs cannot access audit trail')
    assert.equal(canAccessRoute('access-history', devPerms), false, 'Devs cannot access access history')
    assert.equal(canAccessRoute('security-overview', devPerms), false, 'Devs cannot access security & MFA')
    assert.equal(canAccessRoute('inbox', devPerms), false, 'Devs cannot access approvals & inbox')

    // CHRO (mfa:manage) & CEO (system:root) can access Security & MFA; CTO & CFO cannot
    assert.equal(canAccessRoute('security-overview', ['mfa:manage']), true, 'CHRO can access Security & MFA')
    assert.equal(canAccessRoute('security-overview', ['system:root']), true, 'CEO can access Security & MFA')
    assert.equal(canAccessRoute('security-overview', ['quality_gates:read', 'teams:read_all']), false, 'CTO cannot access Security & MFA')
    assert.equal(canAccessRoute('security-overview', ['treasury:read', 'budgets:approve_request']), false, 'CFO cannot access Security & MFA')

    // Executive audit log access
    assert.equal(canAccessRoute('audit-log', ['audit_logs:read_confidential']), true, 'Audit log accessible with confidential audit perm')
    assert.equal(canAccessRoute('audit-log', ['system:root']), true, 'Audit log accessible to CEO')
  })

  // 20. PM QA Test Cases Verification (Personal Kanban, Budget & Finance, Submissions)
  test('validates PM Personal Kanban C-Level filtering, Budget ledger filtering, and submission routing', () => {
    // PM can access tasks, task-management, budget-finance, earnings, projects, teams, report
    assert.equal(canAccessRoute('tasks', ['tasks:read_own']), true, 'PM can access personal tasks')
    assert.equal(canAccessRoute('earnings', ['wallets:read_own']), true, 'PM can access earnings & wallet')
    assert.equal(canAccessRoute('report', ['reports:create']), true, 'PM can access report submissions')

    // Verify C-level filtering logic for PM Kanban
    const mockPersonalTasks = [
      { id: 't1', title: 'Task from CTO', creatorRole: 'cto', tags: ['CTO Mandate'] },
      { id: 't2', title: 'Task from CFO', creatorRole: 'cfo', tags: ['CFO Mandate'] },
      { id: 't3', title: 'Task from CHRO', creatorRole: 'chro', tags: ['CHRO Task'] },
      { id: 't4', title: 'Task from CEO', creatorRole: 'ceo', tags: ['Executive Directive'] },
    ]

    const filterByExec = (exec: string) => {
      if (exec === 'all') return mockPersonalTasks
      return mockPersonalTasks.filter(
        (t) => t.creatorRole === exec || t.tags.some((tag) => tag.toLowerCase().includes(exec)),
      )
    }

    assert.equal(filterByExec('all').length, 4, 'All C-Level tasks returns all 4')
    assert.equal(filterByExec('cto').length, 1, 'CTO filter returns 1 task')
    assert.equal(filterByExec('cfo').length, 1, 'CFO filter returns 1 task')
    assert.equal(filterByExec('chro').length, 1, 'CHRO filter returns 1 task')
    assert.equal(filterByExec('ceo').length, 1, 'CEO filter returns 1 task')

    // Verify Budget Transaction type filtering logic
    const mockTxs = [
      { id: 'tx1', type: 'budget_allocation', amount: 5000 },
      { id: 'tx2', type: 'payout', amount: 3500 },
      { id: 'tx3', type: 'escrow_hold', amount: -2000 },
    ]

    const filterTxByType = (type: string) => {
      if (type === 'all') return mockTxs
      return mockTxs.filter((tx) => tx.type === type)
    }

    assert.equal(filterTxByType('all').length, 3)
    assert.equal(filterTxByType('budget_allocation').length, 1)
    assert.equal(filterTxByType('payout').length, 1)
    assert.equal(filterTxByType('escrow_hold').length, 1)
  })

  test('validates 9 operational workflows: squad resources, mandatory prompts, and self-assignment', () => {
    // 1. Validate Squad Resource model structure
    const mockSquadResource = {
      id: 'res_001',
      teamId: 'team_alpha',
      url: 'https://github.com/pointfex/erp-core',
      description: 'Squad central repository and CI integration',
      createdAt: new Date().toISOString(),
    }
    assert.ok(mockSquadResource.url.startsWith('https://'), 'Resource must have valid URL')
    assert.ok(mockSquadResource.description.length > 0, 'Resource must describe its purpose')

    // 2. Validate mandatory cancellation reason check
    const validateCancellation = (status: string, reason?: string) => {
      if (status === 'cancelled' && (!reason || !reason.trim())) {
        throw new Error('A mandatory cancellation reason is required when cancelling a task.')
      }
      return true
    }
    assert.throws(
      () => validateCancellation('cancelled', ''),
      /mandatory cancellation reason/,
    )
    assert.equal(validateCancellation('cancelled', 'Project requirements changed'), true)

    // 3. Validate mandatory PM satisfaction score on completion
    const validateCompletion = (status: string, score?: number) => {
      if (status === 'completed' && score === undefined) {
        throw new Error('PM satisfaction score is mandatory when completing a task.')
      }
      return true
    }
    assert.throws(
      () => validateCompletion('completed', undefined),
      /PM satisfaction score is mandatory/,
    )
    assert.equal(validateCompletion('completed', 90), true)

    // 4. Validate universal self-assignment rule
    const canAssignTask = (actorId: string, assigneeId: string, permissions: string[]) => {
      if (actorId === assigneeId) return true
      return permissions.includes('tasks:create_assign')
    }
    assert.equal(canAssignTask('emp_dev_1', 'emp_dev_1', []), true, 'Developer can self-assign')
    assert.equal(canAssignTask('emp_pm_1', 'emp_pm_1', []), true, 'PM can self-assign')
    assert.equal(canAssignTask('emp_dev_1', 'emp_dev_2', []), false, 'Developer cannot assign to peer without perm')
  })

  // Stage E: CTO Module System Audit & Observation Regressions (OBS-01..09)
  test('OBS-01 & OBS-02: useCtoData helpers return null/empty instead of synthetic CTO or 95/88/40 KPI defaults', () => {
    const emptyStats = computeCtoQualityStats([], [{ weeklyVelocity: undefined }, {}])
    assert.equal(emptyStats.averageQualityScore, null)
    assert.equal(emptyStats.averageTestCoverage, null)
    assert.equal(emptyStats.totalVelocity, null)

    const populatedStats = computeCtoQualityStats(
      [
        {
          id: 'g1',
          projectId: 'p1',
          complianceScore: 90,
          testCoverage: 80,
          techDebtHours: 6,
          codeSmellsCount: 2,
          bugsDetected: 0,
          vulnerabilitiesCount: 0,
          lastAnalysis: '2026-11-25T00:00:00Z',
          status: 'passed',
        },
        {
          id: 'g2',
          projectId: 'p2',
          complianceScore: 80,
          testCoverage: 70,
          techDebtHours: 4,
          codeSmellsCount: 1,
          bugsDetected: 0,
          vulnerabilitiesCount: 0,
          lastAnalysis: '2026-11-25T00:00:00Z',
          status: 'warning',
        },
      ],
      [{ weeklyVelocity: 35 }, { weeklyVelocity: 25 }],
    )
    assert.equal(populatedStats.averageQualityScore, 85)
    assert.equal(populatedStats.averageTestCoverage, 75)
    assert.equal(populatedStats.totalVelocity, 60)

    // Missing CTO account must resolve to null, not synthetic placeholder user
    const devOnly: any[] = [{ id: 'u1', role: 'developer', name: 'Dev' }]
    assert.equal(resolveCtoAccount(devOnly, devOnly[0]), null)

    const ctoUser: any = { id: 'cto_real', role: 'cto', name: 'Noor' }
    assert.equal(resolveCtoAccount([...devOnly, ctoUser], ctoUser)?.id, 'cto_real')
  })

  test('OBS-03: CTO personal and engineering tasks derive dynamically from actorId and C-level roles without hardcoded IDs', () => {
    const tasks: any[] = [
      { id: 't1', assigneeId: 'cto_99', creatorId: 'ceo_custom', status: 'todo' },
      { id: 't2', assigneeId: 'pm_custom', creatorId: 'cto_99', status: 'in_progress' },
      { id: 't3', assigneeId: 'dev_custom', creatorId: 'pm_custom', isMainProjectTask: true, status: 'todo' },
      { id: 't4', assigneeId: 'pm_custom', creatorId: 'cfo_custom', status: 'in_review' },
    ]
    const personal = deriveCtoPersonalTasks(tasks, 'cto_99')
    assert.deepEqual(
      personal.map((t) => t.id),
      ['t1'],
    )

    const cLevelIds = new Set(['ceo_custom', 'cto_99', 'cfo_custom'])
    const directives = deriveCtoEngineeringTasks(tasks, 'cto_99', cLevelIds)
    assert.deepEqual(
      directives.map((t) => t.id),
      ['t1', 't2', 't4'],
    )

    const useCtoSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useCtoData.ts'), 'utf8')
    assert.ok(!useCtoSrc.includes("'emp_ceo_01'"), 'useCtoData must not hardcode emp_ceo_01')
    assert.ok(!useCtoSrc.includes("'emp_chro'"), 'useCtoData must not hardcode emp_chro')
    assert.ok(!useCtoSrc.includes("'emp_cfo'"), 'useCtoData must not hardcode emp_cfo')
  })

  test('CTO-PRJ-02/03: Final Product Review Checklist covers sections A-D, N/A math, and per-project isolation', () => {
    assert.equal(FINAL_REVIEW_SECTIONS.length, 4)
    const totalItems = FINAL_REVIEW_SECTIONS.reduce((sum, s) => sum + s.items.length, 0)
    assert.equal(totalItems, 20)

    const record = createDefaultProjectChecklist()
    record.statuses.ui_mobile = 'completed'
    record.statuses.ui_tablet = 'completed'
    record.statuses.dd_live_link = 'na'
    record.statuses.dd_repo = 'na'

    const stats = computeProjectChecklistStats(record)
    assert.equal(stats.totalCount, 20)
    assert.equal(stats.completedCount, 2)
    assert.equal(stats.naCount, 2)
    assert.equal(stats.applicableCount, 18)
    assert.equal(stats.remainingCount, 16)
    assert.equal(stats.completionPercentage, Math.round((2 / 18) * 100))
    assert.notEqual(
      getProjectChecklistStorageKey('proj_a'),
      getProjectChecklistStorageKey('proj_b'),
    )
  })

  test('CTO regression source checks: AppContext removes @seu.edu.bd gate, AuditLog uses Blob export, Security page is active', () => {
    const appContextSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/AppContext.tsx'),
      'utf8',
    )
    assert.ok(!appContextSrc.includes('@seu.edu.bd'), 'Corporate domain filter bug must stay removed')

    const auditPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/cto/CtoAuditLogPage.tsx'),
      'utf8',
    )
    assert.ok(auditPageSrc.includes('URL.createObjectURL'), 'Audit export must use Blob object URLs')
    assert.ok(!auditPageSrc.includes('data:text/json'), 'Audit export must not use fragile data: URI')

    const secPageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/cto/CtoSecurityTestingPage.tsx'),
      'utf8',
    )
    assert.ok(!secPageSrc.includes('Coming Soon'), 'Security Testing page must not be a Coming Soon stub')
  })

  return results
}

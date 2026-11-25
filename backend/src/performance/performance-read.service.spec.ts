import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PerformanceReadService } from './performance-read.service'
import { weeklyKpiPm } from './kpi-engine'

describe('Public leaderboard profiles', () => {
  const prisma = {
    employee: { findFirst: jest.fn(), findMany: jest.fn() },
    task: { findMany: jest.fn() },
  }
  const service = new PerformanceReadService(prisma as any)

  beforeEach(() => jest.resetAllMocks())

  it('returns KPI history, tasks and reviewer scores without private profile or ledger fields', async () => {
    prisma.employee.findFirst.mockResolvedValue({
      id: 'other-user', name: 'Other Member', title: 'Project Manager',
      email: 'private@example.com', passwordHash: 'private',
      weeklyKpiRecords: [{
        year: 2026, weekNumber: 47, score: 0, isInactive: false,
        evaluationStatus: 'PROVISIONAL', evaluationBreakdown: { privateNote: 'secret' },
        execEvaluations: [{ evaluatorRole: 'CTO', score: 0, status: 'UNREAD', reason: 'private' }],
      }],
    })
    prisma.task.findMany.mockResolvedValue([{
      id: 'task-1', title: 'Completed work', completedAt: null, pmScore: 0,
      description: 'private',
      execScores: [{ execRole: 'CPO', score: 100, status: 'CONFIRMED', reason: 'private' }],
    }])

    expect(await service.getLeaderboardProfile('other-user')).toEqual({
      userId: 'other-user', name: 'Other Member', role: 'Project Manager',
      kpiSeries: [{
        year: 2026, weekNumber: 47, score: 0, isInactive: false, isProvisional: true,
        evaluations: [{ role: 'CTO', score: 0, status: 'UNREAD' }],
      }],
      tasks: [{
        id: 'task-1', title: 'Completed work', completedAt: null, pmScore: 0,
        evaluations: [{ role: 'CPO', score: 100, status: 'CONFIRMED' }],
      }],
    })
    expect(prisma.employee.findFirst.mock.calls[0][0].where).toEqual({ id: 'other-user', isSuspended: false })
    expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
      assigneeId: 'other-user', status: { in: ['completed', 'COMPLETED'] },
    })
  })

  it('includes existing weekly C-level score columns when separate evaluation rows are absent', async () => {
    prisma.employee.findFirst.mockResolvedValue({
      id: 'pm', name: 'PM', title: 'PM', weeklyKpiRecords: [{
        year: 2026, weekNumber: 46, score: 90, isInactive: false, evaluationStatus: 'CONFIRMED',
        execEvaluations: [], ctoScore: 0, cpoScore: 100, cfoScore: null, chroScore: null,
      }],
    })
    prisma.task.findMany.mockResolvedValue([])
    const profile = await service.getLeaderboardProfile('pm')
    expect(profile.kpiSeries[0].evaluations).toEqual([
      { role: 'CTO', score: 0, status: 'CONFIRMED' },
      { role: 'CPO', score: 100, status: 'CONFIRMED' },
    ])
  })

  it('returns not found for missing or suspended employees', async () => {
    prisma.employee.findFirst.mockResolvedValue(null)
    await expect(service.getLeaderboardProfile('missing')).rejects.toThrow(NotFoundException)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('keeps private ledger access restricted for ordinary members', async () => {
    await expect(service.getLedger('other-user', { id: 'member', role: 'developer' } as any, {}))
      .rejects.toThrow(ForbiddenException)
  })

  it('includes all active members without an email-domain restriction', async () => {
    prisma.employee.findMany.mockResolvedValue([])
    await service.getLeaderboard()
    expect(prisma.employee.findMany.mock.calls[0][0].where).toEqual({ isSuspended: false })
  })

  it('gives C-level evaluations 100 percent of PM KPI, including full marks', () => {
    const result = weeklyKpiPm({
      hasCompletions: true,
      cto: { score: 100, status: 'CONFIRMED' },
      cpo: { score: 100, status: 'CONFIRMED' },
      cfo: { score: 100, status: 'CONFIRMED' },
      chro: { score: 100, status: 'CONFIRMED' },
    })
    expect(result).toEqual({ value: 100, status: 'OFFICIAL' })
  })
})

import { BadRequestException } from '@nestjs/common'
import { isProjectManager } from '../common/employee-role.util'
import { TasksService } from '../tasks/tasks.service'
import { ExecScoresService } from './exec-scores.service'
import { KpiEngineService } from './kpi-engine.service'

describe('PM weekly KPI ownership', () => {
  const pm = { title: 'Delivery Lead', employeeRoles: [{ role: { slug: 'pm' } }] }
  const task = { id: 'task', title: 'Work', assigneeId: 'pm', assignee: pm, status: 'in_review' }
  const actor = { id: 'cto', role: 'cto' } as any
  let tx: any
  let prisma: any

  beforeEach(() => {
    tx = {
      task: { update: jest.fn().mockResolvedValue(task), create: jest.fn().mockResolvedValue(task), findMany: jest.fn() },
      taskExecScore: { createMany: jest.fn(), upsert: jest.fn() },
      weeklyKpiRecord: { upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    }
    prisma = {
      $transaction: (callback: any) => callback(tx),
      employee: { findUnique: jest.fn().mockResolvedValue(pm) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project' }) },
    }
  })

  it.each([
    { title: 'Project Manager' }, { title: 'PM' }, pm,
  ])('recognizes PMs from titles and active role assignments: %j', (employee) => {
    expect(isProjectManager(employee)).toBe(true)
    expect(isProjectManager({ title: 'Engineer' })).toBe(false)
  })

  it('does not let task approval overwrite a PM weekly score', async () => {
    const service = new TasksService(prisma)
    jest.spyOn(service, 'findOne').mockResolvedValue(task as any)
    await service.approve('task', { pmScore: 90 }, actor)
    expect(tx.task.update).toHaveBeenCalled()
    expect(tx.weeklyKpiRecord.upsert).not.toHaveBeenCalled()
  })

  it('does not let a direct task review overwrite a PM weekly score', async () => {
    const service = new TasksService(prisma)
    jest.spyOn(service, 'findOne').mockResolvedValue(task as any)
    await service.scoreTaskDirectly('task', 90, 'Good work', actor)
    expect(tx.taskExecScore.upsert).toHaveBeenCalled()
    expect(tx.weeklyKpiRecord.upsert).not.toHaveBeenCalled()
  })

  it('does not let directly completed task creation overwrite a PM weekly score', async () => {
    const service = new TasksService(prisma)
    jest.spyOn(service as any, 'isAssigneeInPmSquad').mockResolvedValue(true)
    await service.create({ projectId: 'project', assigneeId: 'pm', title: 'Work', initialStatus: 'completed', initialScore: 100 } as any, actor)
    expect(tx.taskExecScore.createMany).toHaveBeenCalled()
    expect(tx.weeklyKpiRecord.upsert).not.toHaveBeenCalled()
  })

  it('does not let task executive confirmation recalculate a PM as a developer', async () => {
    const db = { task: { findUnique: jest.fn().mockResolvedValue(task) }, weeklyKpiRecord: tx.weeklyKpiRecord }
    await new ExecScoresService(prisma).recalculateWeeklyKpiForTask(db as any, 'task')
    expect(tx.weeklyKpiRecord.upsert).not.toHaveBeenCalled()
  })

  it('rejects running the developer weekly calculator for a PM', async () => {
    await expect(new KpiEngineService(prisma).calculateDeveloperWeeklyKpi('pm', 47, 2026))
      .rejects.toThrow(BadRequestException)
  })
  it('rejects a non-executive attempting to score a PM weekly KPI', async () => {
    await expect(new KpiEngineService(prisma).calculatePmWeeklyKpi('pm', 47, 2026, {}, { id: 'pm', role: 'pm' } as any))
      .rejects.toThrow('Only C-level executives')
  })

})

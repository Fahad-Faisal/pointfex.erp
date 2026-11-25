import { ForbiddenException } from '@nestjs/common'
import { AuditLogsService } from './audit-logs.service'
import { computeAuditEntryHash } from '../common/audit-logger.service'

describe('AuditLogsService - Hash Chain Verification, Confidential Access & Filtering', () => {
  let service: AuditLogsService
  let prisma: any
  let authz: any

  const ctoActor: any = {
    id: 'emp_cto_01',
    role: 'cto',
    permissions: ['audit_logs:read', 'audit_logs:verify'],
  }

  const chroActor: any = {
    id: 'emp_chro_01',
    role: 'chro',
    permissions: ['audit_logs:read', 'audit_logs:read_confidential', 'audit_logs:verify'],
  }

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    }
    authz = {
      getAuthzMode: jest.fn(() => 'enforce'),
      check: jest.fn(async (actor: any, code: string) => ({
        allowed: Array.isArray(actor?.permissions) && actor.permissions.includes(code),
      })),
    }
    service = new AuditLogsService(prisma, authz)
  })

  it('excludes confidential HR grievance audit entries from CTO findAll queries and enforces bounded limit', async () => {
    prisma.auditLog.findMany.mockResolvedValue([])

    await service.findAll({ severity: 'CRITICAL', search: 'role', limit: 5000 }, ctoActor)

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
        where: expect.objectContaining({
          severity: 'CRITICAL',
          action: {
            notIn: ['CONFIDENTIAL_GRIEVANCE_SUBMITTED', 'CONFIDENTIAL_GRIEVANCE_ADJUDICATED'],
          },
          OR: expect.any(Array),
        }),
      }),
    )

    await service.findAll({}, chroActor)
    const chroQueryArgs = prisma.auditLog.findMany.mock.calls[1][0]
    expect(chroQueryArgs.take).toBe(100)
    expect(chroQueryArgs.where.action).toBeUndefined()
  })

  it('blocks CTO from opening a confidential audit log entry via findOne while allowing CHRO', async () => {
    prisma.auditLog.findUnique.mockResolvedValue({
      id: 'audit_conf_01',
      action: 'CONFIDENTIAL_GRIEVANCE_SUBMITTED',
      actionCode: 'HR_CONFIDENTIAL_GRIEVANCE_LOGGED',
      severity: 'WARNING',
    })

    await expect(service.findOne('audit_conf_01', ctoActor)).rejects.toThrow(ForbiddenException)

    const chroResult = await service.findOne('audit_conf_01', chroActor)
    expect(chroResult.id).toBe('audit_conf_01')
  })

  it('returns valid GENESIS result on verifyHashChain when chain is empty', async () => {
    prisma.auditLog.findMany.mockResolvedValue([])

    const res = await service.verifyHashChain()
    expect(res).toEqual({
      valid: true,
      checkedCount: 0,
      headSequence: 0,
      headHash: 'GENESIS',
    })
  })

  it('verifies an intact cryptographic hash chain across multiple entries', async () => {
    const t1 = new Date('2026-11-25T05:00:00.000Z')
    const t2 = new Date('2026-11-25T05:05:00.000Z')

    const hash1 = computeAuditEntryHash({
      prevHash: 'GENESIS',
      sequence: 1,
      timestampIso: t1.toISOString(),
      actorId: 'emp_cto_01',
      action: 'TASK_APPROVED',
      actionCode: 'TASK_APPROVED',
      entityType: 'task',
      entityId: 'task_01',
      description: 'Approved deliverable',
      outcome: 'SUCCESS',
      permissionSource: 'ROLE',
      delegationId: null,
      beforeState: null,
      afterState: { status: 'completed' },
    })

    const hash2 = computeAuditEntryHash({
      prevHash: hash1,
      sequence: 2,
      timestampIso: t2.toISOString(),
      actorId: 'emp_cto_01',
      action: 'PROJECT_UPDATED',
      actionCode: 'PROJECT_UPDATED',
      entityType: 'project',
      entityId: 'proj_01',
      description: 'Updated project milestones',
      outcome: 'SUCCESS',
      permissionSource: 'ROLE',
      delegationId: null,
      beforeState: null,
      afterState: null,
    })

    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a_1',
        sequence: 1,
        timestamp: t1,
        actorId: 'emp_cto_01',
        action: 'TASK_APPROVED',
        actionCode: 'TASK_APPROVED',
        entityType: 'task',
        entityId: 'task_01',
        description: 'Approved deliverable',
        outcome: 'SUCCESS',
        permissionSource: 'ROLE',
        delegationId: null,
        beforeState: null,
        afterState: { status: 'completed' },
        prevHash: 'GENESIS',
        entryHash: hash1,
      },
      {
        id: 'a_2',
        sequence: 2,
        timestamp: t2,
        actorId: 'emp_cto_01',
        action: 'PROJECT_UPDATED',
        actionCode: 'PROJECT_UPDATED',
        entityType: 'project',
        entityId: 'proj_01',
        description: 'Updated project milestones',
        outcome: 'SUCCESS',
        permissionSource: 'ROLE',
        delegationId: null,
        beforeState: null,
        afterState: null,
        prevHash: hash1,
        entryHash: hash2,
      },
    ])

    const res = await service.verifyHashChain()
    expect(res).toEqual({
      valid: true,
      checkedCount: 2,
      headSequence: 2,
      headHash: hash2,
    })
  })

  it('detects tampered payload, broken prevHash, and sequence gaps on verifyHashChain', async () => {
    const t1 = new Date('2026-11-25T05:00:00.000Z')
    const hash1 = computeAuditEntryHash({
      prevHash: 'GENESIS',
      sequence: 1,
      timestampIso: t1.toISOString(),
      actorId: 'emp_cto_01',
      action: 'TASK_APPROVED',
      actionCode: 'TASK_APPROVED',
      entityType: 'task',
      entityId: 'task_01',
      description: 'Original description',
      outcome: 'SUCCESS',
      permissionSource: null,
      delegationId: null,
      beforeState: null,
      afterState: null,
    })

    // 1. Payload tampered
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'a_1',
        sequence: 1,
        timestamp: t1,
        actorId: 'emp_cto_01',
        action: 'TASK_APPROVED',
        actionCode: 'TASK_APPROVED',
        entityType: 'task',
        entityId: 'task_01',
        description: 'TAMPERED description',
        outcome: 'SUCCESS',
        permissionSource: null,
        delegationId: null,
        beforeState: null,
        afterState: null,
        prevHash: 'GENESIS',
        entryHash: hash1,
      },
    ])
    const tamperRes = await service.verifyHashChain()
    expect(tamperRes.valid).toBe(false)
    expect(tamperRes.brokenAtId).toBe('a_1')
    expect(tamperRes.brokenReason).toMatch(/Payload digest tamper detected/i)

    // 2. prevHash mismatch
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'a_bad_prev',
        sequence: 1,
        timestamp: t1,
        prevHash: 'WRONG_PREV',
        entryHash: hash1,
      },
    ])
    const prevRes = await service.verifyHashChain()
    expect(prevRes.valid).toBe(false)
    expect(prevRes.brokenReason).toMatch(/prevHash mismatch/i)

    // 3. Sequence gap
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'a_gap',
        sequence: 2,
        timestamp: t1,
        prevHash: 'GENESIS',
        entryHash: hash1,
      },
    ])
    const gapRes = await service.verifyHashChain()
    expect(gapRes.valid).toBe(false)
    expect(gapRes.brokenReason).toMatch(/Sequence gap detected/i)
  })
})

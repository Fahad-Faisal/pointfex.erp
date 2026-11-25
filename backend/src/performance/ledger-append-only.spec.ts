import { PrismaClient, Prisma } from '@prisma/client'
import * as crypto from 'crypto'

describe('Append-Only Ledger Immutability & Cryptographic Integrity', () => {
  let prisma: PrismaClient
  let isDbAvailable = false

  beforeAll(async () => {
    const dbUrl =
      process.env.TEST_DATABASE_URL ||
      'postgresql://pointfex:pointfex@localhost:5439/pointfex_erp_test'

    prisma = new PrismaClient({
      datasources: {
        db: { url: dbUrl },
      },
    })

    try {
      await prisma.$connect()
      // Check connection
      await prisma.$executeRawUnsafe('SELECT 1')
      isDbAvailable = true
    } catch (err) {
      console.warn('PostgreSQL test database not reachable, skipping live DB ledger tests:', err)
      isDbAvailable = false
    }
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('proves normal INSERT into kpi_xp_audit_logs with hash-chaining succeeds', async () => {
    if (!isDbAvailable) return

    // Find latest sequence and entryHash
    const lastEntry = await prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, entryHash: true },
    })

    const sequence = (lastEntry?.sequence || 0) + 1
    const prevHash = lastEntry?.entryHash || '00000000000000000000000000000000'
    const payload = `${sequence}|${prevHash}|emp_dev_01|XP|100|TASK_XP_YIELD|${Date.now()}`
    const entryHash = crypto.createHash('sha256').update(payload).digest('hex')

    const newLog = await prisma.kpiXpAuditLog.create({
      data: {
        sequence,
        prevHash,
        entryHash,
        employeeId: 'emp_dev_01',
        metricType: 'XP',
        deltaValue: new Prisma.Decimal(100),
        actionType: 'TASK_XP_YIELD',
        triggerEvent: 'Test hash chain insert verification',
        authorizedRole: 'CHRO',
        reason: 'Unit test hash chain verification',
      },
    })

    expect(newLog).toBeDefined()
    expect(newLog.sequence).toBe(sequence)
    expect(newLog.entryHash).toBe(entryHash)
    expect(newLog.prevHash).toBe(prevHash)
  })

  it('proves UPDATE on kpi_xp_audit_logs is strictly rejected by DB trigger', async () => {
    if (!isDbAvailable) return

    const existingLog = await prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
    })
    expect(existingLog).toBeDefined()

    await expect(
      prisma.kpiXpAuditLog.update({
        where: { id: existingLog!.id },
        data: { reason: 'Tampered reason attempt' },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*UPDATE.*kpi_xp_audit_logs/i)
  })

  it('proves DELETE on kpi_xp_audit_logs is strictly rejected by DB trigger', async () => {
    if (!isDbAvailable) return

    const existingLog = await prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
    })
    expect(existingLog).toBeDefined()

    await expect(
      prisma.kpiXpAuditLog.delete({
        where: { id: existingLog!.id },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*DELETE.*kpi_xp_audit_logs/i)
  })

  it('proves normal INSERT into xp_ledger_entries succeeds', async () => {
    if (!isDbAvailable) return

    const newEntry = await prisma.xpLedgerEntry.create({
      data: {
        employeeId: 'emp_dev_01',
        delta: 20,
        reason: 'Test XP Award entry',
        entryType: 'AWARD',
        status: 'POSTED',
      },
    })

    expect(newEntry).toBeDefined()
    expect(newEntry.delta).toBe(20)
    expect(newEntry.status).toBe('POSTED')
  })

  it('proves UPDATE on xp_ledger_entries is strictly rejected by DB trigger', async () => {
    if (!isDbAvailable) return

    const existingEntry = await prisma.xpLedgerEntry.findFirst({
      where: { employeeId: 'emp_dev_01' },
    })
    expect(existingEntry).toBeDefined()

    await expect(
      prisma.xpLedgerEntry.update({
        where: { id: existingEntry!.id },
        data: { delta: 9999 },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*UPDATE.*xp_ledger_entries/i)
  })

  it('proves DELETE on xp_ledger_entries is strictly rejected by DB trigger', async () => {
    if (!isDbAvailable) return

    const existingEntry = await prisma.xpLedgerEntry.findFirst({
      where: { employeeId: 'emp_dev_01' },
    })
    expect(existingEntry).toBeDefined()

    await expect(
      prisma.xpLedgerEntry.delete({
        where: { id: existingEntry!.id },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*DELETE.*xp_ledger_entries/i)
  })

  it('proves normal INSERT into audit_annotations succeeds and UPDATE/DELETE fail', async () => {
    if (!isDbAvailable) return

    const auditLog = await prisma.kpiXpAuditLog.findFirst({
      orderBy: { sequence: 'desc' },
    })
    expect(auditLog).toBeDefined()

    const annotation = await prisma.auditAnnotation.create({
      data: {
        auditLogId: auditLog!.id,
        authorId: 'emp_chro_01',
        note: 'CHRO verified historical ledger record alignment',
      },
    })

    expect(annotation).toBeDefined()
    expect(annotation.note).toContain('CHRO verified')

    // UPDATE must fail
    await expect(
      prisma.auditAnnotation.update({
        where: { id: annotation.id },
        data: { note: 'Tampered annotation note' },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*UPDATE.*audit_annotations/i)

    // DELETE must fail
    await expect(
      prisma.auditAnnotation.delete({
        where: { id: annotation.id },
      }),
    ).rejects.toThrow(/Append-only ledger violation.*DELETE.*audit_annotations/i)
  })

  it('enforces check constraint on tasks pmScore (0 to 100)', async () => {
    if (!isDbAvailable) return

    // Valid score (e.g. 85)
    const validTask = await prisma.task.findFirst()
    expect(validTask).toBeDefined()

    await prisma.task.update({
      where: { id: validTask!.id },
      data: { pmScore: new Prisma.Decimal(85) },
    })

    // Invalid score (> 100)
    await expect(
      prisma.task.update({
        where: { id: validTask!.id },
        data: { pmScore: new Prisma.Decimal(105) },
      }),
    ).rejects.toThrow(/check constraint|violates check/i)

    // Invalid score (< 0)
    await expect(
      prisma.task.update({
        where: { id: validTask!.id },
        data: { pmScore: new Prisma.Decimal(-5) },
      }),
    ).rejects.toThrow(/check constraint|violates check/i)
  })
})


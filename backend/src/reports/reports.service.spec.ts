import { Test, TestingModule } from '@nestjs/testing'
import { ReportsService } from './reports.service'
import { PrismaService } from '../common/prisma.service'
import { ForbiddenException } from '@nestjs/common'

describe('ReportsService - Whistleblower Confidentiality & Cross-Role Escalations', () => {
  let service: ReportsService
  let prisma: any

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      report: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile()

    service = module.get<ReportsService>(ReportsService)
  })

  describe('Confidential Grievance Visibility Rules', () => {
    it('should filter OUT confidential grievances when queried by Developer or PM', async () => {
      prisma.report.findMany.mockResolvedValue([])

      // Developer queries reports
      await service.findAll({}, { id: 'emp_dev_01', role: 'developer' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ isConfidential: false, confidentialTo: null }),
            ]),
          }),
        }),
      )

      // PM queries reports
      await service.findAll({}, { id: 'emp_pm_01', role: 'pm' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ isConfidential: false, confidentialTo: null }),
            ]),
          }),
        }),
      )
    })

    it('should allow CHRO and CEO to query confidential grievances', async () => {
      prisma.report.findMany.mockResolvedValue([{ id: 'rep_conf_01', isConfidential: true }])

      // CHRO queries
      await service.findAll({ isConfidential: true }, { id: 'emp_chro_01', role: 'chro' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isConfidential: true,
          }),
        }),
      )

      // CEO queries
      await service.findAll({ isConfidential: true }, { id: 'emp_ceo_01', role: 'ceo' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isConfidential: true,
          }),
        }),
      )
    })

    it('should throw ForbiddenException if a PM attempts to open a confidential grievance', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'rep_conf_01',
        title: 'Confidential Whistleblower Filing',
        authorId: 'emp_dev_04',
        isConfidential: true,
      })

      // PM attempts to read confidential grievance
      await expect(service.findOne('rep_conf_01', { id: 'emp_pm_01', role: 'pm' })).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should filter out confidential grievances for CTO and block CTO status updates on confidential grievances', async () => {
      prisma.report.findMany.mockResolvedValue([])
      await service.findAll({}, { id: 'emp_cto_01', role: 'cto' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ isConfidential: false, confidentialTo: null }),
              expect.objectContaining({ authorId: 'emp_cto_01' }),
            ]),
          }),
        }),
      )

      prisma.report.findUnique.mockResolvedValue({
        id: 'rep_conf_02',
        title: 'Sensitive HR Conduct Report',
        authorId: 'emp_cto_01',
        isConfidential: true,
        confidentialTo: 'chro',
      })

      await expect(
        service.updateStatus(
          'rep_conf_02',
          { status: 'resolved', feedback: 'Unauthorized triage' },
          { id: 'emp_cto_01', role: 'cto' },
        ),
      ).rejects.toThrow(ForbiddenException)

      // Different CTO cannot even view another employee's confidential grievance
      await expect(
        service.findOne('rep_conf_02', { id: 'emp_cto_99', role: 'cto' }),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('PM Forward Developer Idea to C-Level', () => {
    it('should update status to forwarded_to_c_level with PM endorsement', async () => {
      prisma.report.findUnique.mockResolvedValue({
        id: 'prop_01',
        title: 'GIS Sync Engine Proposal',
        isConfidential: false,
      })
      prisma.report.update.mockResolvedValue({
        id: 'prop_01',
        status: 'forwarded_to_c_level',
      })

      const res = await service.forwardToCLevel(
        'prop_01',
        {
          recipient: 'Chief Technology Officer (CTO)',
          endorsement: 'Strongly endorsed for technical feasibility by Squad Alpha',
        },
        { id: 'emp_pm_01', role: 'pm' },
      )

      expect(res.status).toBe('forwarded_to_c_level')
      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'forwarded_to_c_level',
            forwardedTo: 'Chief Technology Officer (CTO)',
            pmEndorsement: 'Strongly endorsed for technical feasibility by Squad Alpha',
          }),
        }),
      )
    })
  })
})

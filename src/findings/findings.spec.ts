import { FindingsService } from './findings.module';
import { NotFoundException } from '@nestjs/common';

describe('FindingsService', () => {
  let service: FindingsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      complianceFinding: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'f1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      aiSystem: { update: jest.fn() },
    };
    service = new FindingsService(prisma);
  });

  describe('createFinding', () => {
    it('should create with status OPEN', async () => {
      const r = await service.createFinding({
        aiSystemId: 's1', assessmentId: 'a1', organizationId: 'o1',
        articleRef: 'Art. 9', severity: 'HIGH', category: 'RISK_MANAGEMENT',
        title: 'Missing RM', description: 'No risk management.', remediation: 'Add it.',
      });
      expect(prisma.complianceFinding.create).toHaveBeenCalled();
      expect(r.status).toBe('OPEN');
    });
  });

  describe('updateStatus - workflow', () => {
    const mockFinding = (status: string) => ({ id: 'f1', status, aiSystemId: 's1', organizationId: 'o1' });

    it('OPEN -> IN_PROGRESS: valid', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('OPEN'));
      prisma.complianceFinding.count.mockResolvedValue(0);
      await service.updateStatus('f1', 'o1', 'IN_PROGRESS');
      expect(prisma.complianceFinding.update).toHaveBeenCalled();
    });

    it('OPEN -> ACCEPTED: valid', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('OPEN'));
      prisma.complianceFinding.count.mockResolvedValue(0);
      await service.updateStatus('f1', 'o1', 'ACCEPTED');
      expect(prisma.complianceFinding.update).toHaveBeenCalled();
    });

    it('OPEN -> FALSE_POSITIVE: valid', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('OPEN'));
      prisma.complianceFinding.count.mockResolvedValue(0);
      await service.updateStatus('f1', 'o1', 'FALSE_POSITIVE');
      expect(prisma.complianceFinding.update).toHaveBeenCalled();
    });

    it('IN_PROGRESS -> RESOLVED: valid, sets resolvedAt', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('IN_PROGRESS'));
      prisma.complianceFinding.count.mockResolvedValue(0);
      await service.updateStatus('f1', 'o1', 'RESOLVED', 'user1', 'Fixed it');
      const call = prisma.complianceFinding.update.mock.calls[0][0];
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
      expect(call.data.resolvedBy).toBe('user1');
    });

    it('RESOLVED -> VERIFIED: valid', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('RESOLVED'));
      prisma.complianceFinding.count.mockResolvedValue(0);
      await service.updateStatus('f1', 'o1', 'VERIFIED');
      expect(prisma.complianceFinding.update).toHaveBeenCalled();
    });

    it('OPEN -> VERIFIED: INVALID', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('OPEN'));
      await expect(service.updateStatus('f1', 'o1', 'VERIFIED')).rejects.toThrow('Invalid transition');
    });

    it('VERIFIED -> anything: INVALID (terminal)', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('VERIFIED'));
      await expect(service.updateStatus('f1', 'o1', 'OPEN')).rejects.toThrow('Invalid transition');
    });

    it('IN_PROGRESS -> ACCEPTED: INVALID', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(mockFinding('IN_PROGRESS'));
      await expect(service.updateStatus('f1', 'o1', 'ACCEPTED')).rejects.toThrow('Invalid transition');
    });
  });

  describe('getSummary', () => {
    it('should calculate risk score correctly', async () => {
      prisma.complianceFinding.groupBy
        .mockResolvedValueOnce([{ severity: 'CRITICAL', _count: 2 }, { severity: 'HIGH', _count: 3 }, { severity: 'MEDIUM', _count: 5 }])
        .mockResolvedValueOnce([{ status: 'OPEN', _count: 10 }])
        .mockResolvedValueOnce([{ category: 'RISK_MANAGEMENT', _count: 4 }]);

      const r = await service.getSummary('o1');
      expect(r.critical).toBe(2);
      expect(r.high).toBe(3);
      expect(r.medium).toBe(5);
      expect(r.totalOpen).toBe(10);
      expect(r.riskScore).toBe(80); // 2*25 + 3*10 = 80
    });

    it('should cap risk score at 100', async () => {
      prisma.complianceFinding.groupBy
        .mockResolvedValueOnce([{ severity: 'CRITICAL', _count: 5 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const r = await service.getSummary('o1');
      expect(r.riskScore).toBe(100); // 5*25 = 125, capped at 100
    });

    it('should return 0 risk score with no findings', async () => {
      prisma.complianceFinding.groupBy.mockResolvedValue([]);
      const r = await service.getSummary('o1');
      expect(r.riskScore).toBe(0);
      expect(r.totalOpen).toBe(0);
    });
  });

  describe('getById', () => {
    it('should throw NotFoundException if not found', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue(null);
      await expect(service.getById('bad-id', 'o1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateCompliance', () => {
    it('should set NON_COMPLIANT when critical findings exist', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue({ id: 'f1', status: 'OPEN', aiSystemId: 's1', organizationId: 'o1' });
      prisma.complianceFinding.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0); // 2 critical, 0 medium

      await service.updateStatus('f1', 'o1', 'IN_PROGRESS');

      expect(prisma.aiSystem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { complianceStatus: 'NON_COMPLIANT' } }),
      );
    });

    it('should set PARTIAL when only medium findings', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue({ id: 'f1', status: 'OPEN', aiSystemId: 's1', organizationId: 'o1' });
      prisma.complianceFinding.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3); // 0 critical, 3 medium

      await service.updateStatus('f1', 'o1', 'IN_PROGRESS');

      expect(prisma.aiSystem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { complianceStatus: 'PARTIAL' } }),
      );
    });

    it('should set COMPLIANT when no open findings', async () => {
      prisma.complianceFinding.findFirst.mockResolvedValue({ id: 'f1', status: 'OPEN', aiSystemId: 's1', organizationId: 'o1' });
      prisma.complianceFinding.count.mockResolvedValue(0);

      await service.updateStatus('f1', 'o1', 'IN_PROGRESS');

      expect(prisma.aiSystem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { complianceStatus: 'COMPLIANT' } }),
      );
    });
  });
});

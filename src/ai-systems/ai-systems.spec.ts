import { AiSystemsService } from './ai-systems.module';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AiSystemsService', () => {
  let service: AiSystemsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      organization: { findUnique: jest.fn() },
      aiSystem: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      complianceFinding: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new AiSystemsService(prisma);
  });

  describe('create', () => {
    it('should create system within plan limit', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'STARTER' });
      prisma.aiSystem.count.mockResolvedValue(1); // 1 of 3 used

      const r = await service.create({ name: 'Test AI', description: 'A test system' }, 'o1');
      expect(r.name).toBe('Test AI');
      expect(prisma.aiSystem.create).toHaveBeenCalled();
    });

    it('should reject when plan limit reached (FREE = 1)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'FREE' });
      prisma.aiSystem.count.mockResolvedValue(1);

      await expect(service.create({ name: 'Over Limit', description: 'x' }, 'o1')).rejects.toThrow(ForbiddenException);
    });

    it('should reject when STARTER limit reached (3)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'STARTER' });
      prisma.aiSystem.count.mockResolvedValue(3);

      await expect(service.create({ name: 'Over', description: 'x' }, 'o1')).rejects.toThrow(ForbiddenException);
    });

    it('should allow PROFESSIONAL up to 15', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'PROFESSIONAL' });
      prisma.aiSystem.count.mockResolvedValue(14);

      const r = await service.create({ name: 'OK', description: 'x' }, 'o1');
      expect(r.name).toBe('OK');
    });
  });

  describe('findOne', () => {
    it('should return system with relations', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue({
        id: 's1', name: 'Test', organizationId: 'o1',
        assessments: [], findings: [], documents: [],
      });

      const r = await service.findOne('s1', 'o1');
      expect(r.name).toBe('Test');
    });

    it('should throw NotFoundException', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue(null);
      await expect(service.findOne('bad', 'o1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (soft delete)', () => {
    it('should set deletedAt instead of deleting', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'Test', organizationId: 'o1', assessments: [], findings: [], documents: [] });

      await service.remove('s1', 'o1');
      expect(prisma.aiSystem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
      );
    });
  });

  describe('getOverview', () => {
    it('should return dashboard data with deadline countdown', async () => {
      prisma.aiSystem.count.mockResolvedValue(5);
      prisma.aiSystem.groupBy.mockResolvedValue([{ riskLevel: 'HIGH', _count: 2 }]);
      prisma.complianceFinding.count.mockResolvedValue(8);

      const r = await service.getOverview('o1');
      expect(r.total).toBe(5);
      expect(r.daysToDeadline).toBeGreaterThan(0);
      expect(r.openFindings).toBe(8);
    });
  });
});

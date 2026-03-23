import { MonitoringService } from './monitoring.module';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      aiSystem: { findMany: jest.fn().mockResolvedValue([]) },
      generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
      monitoringEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'e1', ...data })),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new MonitoringService(prisma);
  });

  describe('getSummary', () => {
    it('should return summary with deadline countdown', async () => {
      prisma.monitoringEvent.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
      prisma.monitoringEvent.groupBy.mockResolvedValue([{ severity: 'HIGH', _count: 2 }]);

      const r = await service.getSummary('o1');
      expect(r.total).toBe(10);
      expect(r.unacknowledged).toBe(3);
      expect(r.daysToDeadline).toBeGreaterThan(0);
      expect(r.daysToDeadline).toBeLessThan(365);
      expect(r.bySeverity).toEqual({ HIGH: 2 });
    });
  });

  describe('acknowledge', () => {
    it('should mark event as acknowledged', async () => {
      await service.acknowledge('e1', 'o1', 'user1');
      expect(prisma.monitoringEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'e1', organizationId: 'o1' },
        data: expect.objectContaining({ acknowledged: true, acknowledgedBy: 'user1', acknowledgedAt: expect.any(Date) }),
      });
    });
  });

  describe('runComplianceCheck', () => {
    it('should detect stale assessments (>90 days)', async () => {
      prisma.aiSystem.findMany.mockResolvedValue([{
        id: 's1', name: 'Old System', organizationId: 'o1', riskLevel: 'HIGH',
        lastAssessmentAt: new Date(Date.now() - 100 * 86400000), // 100 days ago
        findings: [],
      }]);

      await service.runComplianceCheck();

      expect(prisma.monitoringEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'COMPLIANCE_DRIFT', severity: 'HIGH',
          title: 'Assessment overdue',
        }),
      });
    });

    it('should detect deadline pressure with critical findings', async () => {
      prisma.aiSystem.findMany.mockResolvedValue([{
        id: 's1', name: 'Critical System', organizationId: 'o1', riskLevel: 'HIGH',
        lastAssessmentAt: new Date(),
        findings: [{ severity: 'CRITICAL' }, { severity: 'HIGH' }],
      }]);

      await service.runComplianceCheck();

      expect(prisma.monitoringEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'DEADLINE_WARNING', severity: 'CRITICAL',
        }),
      });
    });

    it('should not create duplicate events within 24h', async () => {
      prisma.monitoringEvent.findFirst.mockResolvedValue({ id: 'existing' });
      prisma.aiSystem.findMany.mockResolvedValue([{
        id: 's1', name: 'Test', organizationId: 'o1', riskLevel: 'HIGH',
        lastAssessmentAt: new Date(Date.now() - 100 * 86400000),
        findings: [],
      }]);

      await service.runComplianceCheck();

      expect(prisma.monitoringEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('runDocFreshnessCheck', () => {
    it('should detect expired documents', async () => {
      prisma.generatedDocument.findMany.mockResolvedValue([{
        id: 'd1', title: 'Annex IV', docType: 'ANNEX_IV', version: 1,
        aiSystem: { id: 's1', name: 'System', organizationId: 'o1' },
      }]);

      await service.runDocFreshnessCheck();

      expect(prisma.monitoringEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'DOC_EXPIRY', severity: 'MEDIUM',
        }),
      });
    });
  });

  describe('listEvents', () => {
    it('should filter by severity', async () => {
      await service.listEvents('o1', { severity: 'HIGH' });
      expect(prisma.monitoringEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ severity: 'HIGH' }) }),
      );
    });

    it('should limit results', async () => {
      await service.listEvents('o1', { limit: 10 });
      expect(prisma.monitoringEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('should cap at 100 results', async () => {
      await service.listEvents('o1', { limit: 999 });
      expect(prisma.monitoringEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});

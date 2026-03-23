import { NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.module';

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let prisma: any;
  let classAgent: any;
  let auditAgent: any;
  let findingsService: any;

  beforeEach(() => {
    prisma = {
      aiSystem: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      assessment: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', ...data })),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assessmentResult: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      complianceFinding: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    classAgent = {
      classify: jest.fn().mockResolvedValue({
        riskLevel: 'HIGH', confidence: 0.95,
        reasoning: 'Employment AI', articleReferences: ['Art. 6'],
        annexReferences: ['Annex III, domain 4'], obligations: ['Art. 9', 'Art. 10'],
        tokensUsed: 500,
      }),
    };

    auditAgent = {
      audit: jest.fn().mockResolvedValue({
        overallScore: 45, overallStatus: 'NON_COMPLIANT',
        areas: [], findings: [
          { id: 'TA-001', area: 'Risk Management', article: 'Art. 9', severity: 'HIGH', title: 'No RM', description: 'Missing', remediation: 'Add it', estimatedEffort: 'WEEKS' },
        ],
        summary: 'Low score', tokensUsed: 1000, durationMs: 5000,
      }),
    };

    findingsService = {
      createFinding: jest.fn().mockResolvedValue({ id: 'f1' }),
    };

    service = new AssessmentsService(prisma, classAgent, auditAgent, findingsService);
  });

  describe('create', () => {
    it('should create assessment and trigger pipeline', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'Test', organizationId: 'o1', description: 'AI', purpose: 'Hiring', sector: 'EMPLOYMENT', dataTypes: ['PERSONAL'] });

      const r = await service.create('s1', 'o1', 'user1');
      expect(r.id).toBe('a1');
      expect(r.status).toBe('PENDING');
      expect(r.type).toBe('FULL');
      expect(prisma.assessment.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown system', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue(null);
      await expect(service.create('bad', 'o1', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pipeline - UNACCEPTABLE result', () => {
    it('should stop pipeline and create CRITICAL finding', async () => {
      classAgent.classify.mockResolvedValue({
        riskLevel: 'UNACCEPTABLE', confidence: 0.99,
        reasoning: 'Social scoring prohibited', articleReferences: ['Art. 5'],
        annexReferences: [], obligations: [], tokensUsed: 300,
      });

      prisma.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'Test', organizationId: 'o1', description: 'Social scoring', purpose: 'Score citizens', sector: 'GOV', dataTypes: [] });

      await service.create('s1', 'o1', 'user1');

      // Wait for async pipeline
      await new Promise((r) => setTimeout(r, 100));

      // Should NOT call audit agent for UNACCEPTABLE
      expect(auditAgent.audit).not.toHaveBeenCalled();

      // Should create CRITICAL finding
      expect(findingsService.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'CRITICAL', category: 'PROHIBITED_USE', articleRef: 'Art. 5' }),
      );
    });
  });

  describe('pipeline - HIGH risk result', () => {
    it('should run classification + audit + generate findings', async () => {
      prisma.aiSystem.findFirst.mockResolvedValue({
        id: 's1', name: 'Hiring', organizationId: 'o1',
        description: 'CV screener', purpose: 'Hiring', sector: 'EMPLOYMENT',
        dataTypes: ['PERSONAL'], repoUrl: null,
      });

      prisma.assessmentResult.findMany.mockResolvedValue([
        { status: 'COMPLETED', score: 95 },
        { status: 'COMPLETED', score: 45 },
      ]);

      await service.create('s1', 'o1', 'user1');
      await new Promise((r) => setTimeout(r, 200));

      // Should have called classification
      expect(classAgent.classify).toHaveBeenCalled();

      // Should have called technical audit (HIGH risk)
      expect(auditAgent.audit).toHaveBeenCalled();

      // Should have generated compliance findings (Art. 9-15 + Art. 50)
      expect(findingsService.createFinding).toHaveBeenCalled();
      const findingCalls = findingsService.createFinding.mock.calls;
      const articles = findingCalls.map((c: any) => c[0].articleRef);
      expect(articles).toContain('Art. 9');
      expect(articles).toContain('Art. 10');
      expect(articles).toContain('Art. 11');
    });
  });

  describe('get', () => {
    it('should return assessment with results', async () => {
      prisma.assessment.findFirst.mockResolvedValue({
        id: 'a1', status: 'COMPLETED', overallScore: 70,
        results: [{ agentType: 'CLASSIFICATION', status: 'COMPLETED', score: 95 }],
        aiSystem: { id: 's1', name: 'Test', riskLevel: 'HIGH' },
      });

      const r = await service.get('a1', 'o1');
      expect(r.overallScore).toBe(70);
      expect(r.results).toHaveLength(1);
    });

    it('should throw NotFoundException', async () => {
      prisma.assessment.findFirst.mockResolvedValue(null);
      await expect(service.get('bad', 'o1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('should return assessments for system', async () => {
      prisma.assessment.findMany.mockResolvedValue([{ id: 'a1', status: 'COMPLETED' }]);
      const r = await service.list('s1', 'o1');
      expect(r).toHaveLength(1);
    });
  });

  describe('mapCategory', () => {
    it('should map audit areas to finding categories', () => {
      // Access private method via any cast
      const s = service as any;
      expect(s.mapCategory('Risk Management')).toBe('RISK_MANAGEMENT');
      expect(s.mapCategory('Data Governance')).toBe('DATA_GOVERNANCE');
      expect(s.mapCategory('Technical Documentation')).toBe('DOCUMENTATION');
      expect(s.mapCategory('Record-Keeping & Logging')).toBe('LOGGING');
      expect(s.mapCategory('Transparency')).toBe('TRANSPARENCY');
      expect(s.mapCategory('Human Oversight')).toBe('HUMAN_OVERSIGHT');
      expect(s.mapCategory('Accuracy, Robustness & Cybersecurity')).toBe('ACCURACY_ROBUSTNESS');
      expect(s.mapCategory('Unknown Area')).toBe('OTHER');
    });
  });
});

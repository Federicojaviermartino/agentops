import { ComplianceScoreService } from './compliance-score.module';

describe('ComplianceScoreService', () => {
  let service: ComplianceScoreService;
  let prisma: any;

  beforeEach(() => {
    prisma = { aiSystem: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } };
    service = new ComplianceScoreService(prisma);
  });

  it('calculates HIGH risk system with all findings = grade F', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'Hiring AI', riskLevel: 'HIGH', findings: [
        { severity: 'CRITICAL', category: 'RISK_MANAGEMENT', status: 'OPEN' },
        { severity: 'CRITICAL', category: 'DATA_GOVERNANCE', status: 'OPEN' },
        { severity: 'HIGH', category: 'LOGGING', status: 'OPEN' },
      ], assessments: [], documents: [],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r).not.toBeNull();
    expect(r!.overallScore).toBeLessThan(75); // Not A or B
    expect(r!.breakdown.length).toBe(9);
    expect(r!.penalties.critical).toBe(2);
  });

  it('calculates HIGH risk with full compliance = grade A', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'Good AI', riskLevel: 'HIGH', findings: [],
      assessments: [{ overallScore: 95 }],
      documents: [{ docType: 'ANNEX_IV' }, { docType: 'FRIA' }],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.grade).toBe('A');
    expect(r!.overallScore).toBeGreaterThan(85);
    expect(r!.documentation.annexIV).toBe(true);
    expect(r!.documentation.fria).toBe(true);
  });

  it('calculates LIMITED risk system', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'Chatbot', riskLevel: 'LIMITED', findings: [],
      assessments: [], documents: [],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.breakdown.length).toBe(3);
    expect(r!.breakdown.find(b => b.articleRef === 'Art. 50')).toBeDefined();
  });

  it('calculates MINIMAL risk = grade A', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'Simple', riskLevel: 'MINIMAL', findings: [],
      assessments: [], documents: [],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.grade).toBe('A');
    expect(r!.overallScore).toBe(100);
  });

  it('unclassified system = grade F', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'Unknown', riskLevel: null, findings: [],
      assessments: [], documents: [],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.grade).toBe('F');
    expect(r!.overallScore).toBe(0);
  });

  it('returns null for unknown system', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue(null);
    const r = await service.calculateForSystem('o1', 'unknown');
    expect(r).toBeNull();
  });

  it('org score averages system scores', async () => {
    prisma.aiSystem.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    prisma.aiSystem.findFirst
      .mockResolvedValueOnce({ id: 's1', name: 'A', riskLevel: 'MINIMAL', findings: [], assessments: [], documents: [] })
      .mockResolvedValueOnce({ id: 's2', name: 'B', riskLevel: 'MINIMAL', findings: [], assessments: [], documents: [] });
    const r = await service.calculateForOrg('o1');
    expect(r.organizationScore).toBe(100);
    expect(r.organizationGrade).toBe('A');
    expect(r.totalSystems).toBe(2);
  });

  it('penalty calculation: critical=25, high=10, medium=3', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'X', riskLevel: 'HIGH', assessments: [], documents: [],
      findings: [
        { severity: 'CRITICAL', category: 'RISK_MANAGEMENT', status: 'OPEN' },
        { severity: 'HIGH', category: 'LOGGING', status: 'OPEN' },
        { severity: 'MEDIUM', category: 'TRANSPARENCY', status: 'OPEN' },
        { severity: 'LOW', category: 'ACCURACY_ROBUSTNESS', status: 'RESOLVED' }, // Not counted
      ],
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.penalties.critical).toBe(1);
    expect(r!.penalties.high).toBe(1);
    expect(r!.penalties.medium).toBe(1);
    expect(r!.penalties.deduction).toBe(38); // 25+10+3
  });

  it('caps penalty deduction at 100', async () => {
    prisma.aiSystem.findFirst.mockResolvedValue({
      id: 's1', name: 'X', riskLevel: 'HIGH', assessments: [], documents: [],
      findings: Array(5).fill(null).map(() => ({ severity: 'CRITICAL', category: 'RISK_MANAGEMENT', status: 'OPEN' })),
    });
    const r = await service.calculateForSystem('o1', 's1');
    expect(r!.penalties.deduction).toBe(100); // Capped
  });
});

/**
 * E2E-style tests for critical API flows and classification metrics.
 */
import { DemoService } from '../demo/demo.module';
import { calculateMetrics } from '../validation/validation.module';

// Validation metrics - F1/Precision/Recall
describe('Classification Metrics (F1/Precision/Recall)', () => {
  it('calculates perfect accuracy', () => {
    const preds = [
      { predicted: 'HIGH', expected: 'HIGH' },
      { predicted: 'LIMITED', expected: 'LIMITED' },
      { predicted: 'MINIMAL', expected: 'MINIMAL' },
    ];
    const m = calculateMetrics(preds);
    expect(m.accuracy).toBe(100);
    expect(m.f1Macro).toBe(1);
  });

  it('calculates zero accuracy', () => {
    const preds = [
      { predicted: 'HIGH', expected: 'MINIMAL' },
      { predicted: 'LIMITED', expected: 'HIGH' },
    ];
    const m = calculateMetrics(preds);
    expect(m.accuracy).toBe(0);
  });

  it('handles mixed results with per-class breakdown', () => {
    const preds = [
      { predicted: 'HIGH', expected: 'HIGH' },
      { predicted: 'HIGH', expected: 'HIGH' },
      { predicted: 'LIMITED', expected: 'HIGH' },    // FN for HIGH, FP for LIMITED
      { predicted: 'LIMITED', expected: 'LIMITED' },
      { predicted: 'MINIMAL', expected: 'MINIMAL' },
    ];
    const m = calculateMetrics(preds);
    expect(m.accuracy).toBe(80);
    // HIGH: TP=2, FP=0, FN=1 -> precision=1.0, recall=0.67
    expect(m.perClass.HIGH.precision).toBe(1);
    expect(m.perClass.HIGH.recall).toBe(0.67);
    // LIMITED: TP=1, FP=1, FN=0 -> precision=0.5, recall=1.0
    expect(m.perClass.LIMITED.precision).toBe(0.5);
    expect(m.perClass.LIMITED.recall).toBe(1);
    expect(m.perClass.MINIMAL.f1).toBe(1);
  });

  it('handles empty predictions', () => {
    const m = calculateMetrics([]);
    expect(m.accuracy).toBe(0);
    expect(m.f1Macro).toBe(0);
  });

  it('reports support correctly', () => {
    const preds = [
      { predicted: 'HIGH', expected: 'HIGH' },
      { predicted: 'HIGH', expected: 'LIMITED' },
      { predicted: 'HIGH', expected: 'HIGH' },
    ];
    const m = calculateMetrics(preds);
    expect(m.perClass.HIGH.support).toBe(2);
    expect(m.perClass.LIMITED.support).toBe(1);
  });
});

// Demo flow
describe('Demo Service', () => {
  it('returns demo email and features', () => {
    const mockJwt = { sign: jest.fn().mockReturnValue('test.jwt.token') };
    const mockPrisma = { organization: { upsert: jest.fn() }, user: { upsert: jest.fn() } };
    const svc = new DemoService(mockPrisma as any, mockJwt as any);
    const creds = svc.getDemoCredentials();
    expect(creds.email).toBe('demo@agentops.eu');
    expect(creds.features.length).toBeGreaterThan(0);
    expect(creds.limitations.length).toBeGreaterThan(0);
    expect(creds.note).toContain('read-only');
  });

  it('getDemoToken signs real JWT and upserts user', async () => {
    const mockJwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    const mockPrisma = { organization: { upsert: jest.fn().mockResolvedValue({}) }, user: { upsert: jest.fn().mockResolvedValue({}) } };
    const svc = new DemoService(mockPrisma as any, mockJwt as any);
    const result = await svc.getDemoToken();
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.expiresIn).toBe(3600);
    expect(mockJwt.sign).toHaveBeenCalledTimes(2); // access + refresh
    expect(mockPrisma.organization.upsert).toHaveBeenCalled();
    expect(mockPrisma.user.upsert).toHaveBeenCalled();
  });

  it('demo user has VIEWER role', () => {
    const mockJwt = { sign: jest.fn() };
    const mockPrisma = {};
    const svc = new DemoService(mockPrisma as any, mockJwt as any);
    expect(svc.getDemoUser().role).toBe('VIEWER');
  });
});

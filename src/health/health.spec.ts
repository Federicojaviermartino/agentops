import { HealthController, HealthModule } from './health.module';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    controller = new HealthController(prisma);
  });

  it('check returns ok status', () => {
    const r = controller.check();
    expect(r.status).toBe('ok');
    expect(r.timestamp).toBeDefined();
    expect(r.version).toBeDefined();
  });

  it('ready returns connected when DB works', async () => {
    const r = await controller.ready();
    expect(r.status).toBe('ready');
    expect(r.database).toBe('connected');
  });

  it('ready returns disconnected when DB fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const r = await controller.ready();
    expect(r.status).toBe('not_ready');
    expect(r.database).toBe('disconnected');
  });

  it('module exists', () => { expect(HealthModule).toBeDefined(); });
});

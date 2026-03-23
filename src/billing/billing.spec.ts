import { BillingService } from './billing.module';
import { BadRequestException } from '@nestjs/common';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      organization: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      aiSystem: { count: jest.fn().mockResolvedValue(2) },
    };
    service = new BillingService(prisma);
  });

  describe('getStatus', () => {
    it('should return STARTER plan details', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'STARTER', stripeSubscriptionStatus: 'active' });
      const r = await service.getStatus('o1');
      expect(r.plan).toBe('STARTER');
      expect(r.planName).toBe('Starter');
      expect(r.systemLimit).toBe(3);
      expect(r.systemsUsed).toBe(2);
      expect(r.hasActiveSubscription).toBe(true);
      expect(r.features).toContain('Classification Agent');
    });

    it('should return PROFESSIONAL plan details', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'PROFESSIONAL', stripeSubscriptionStatus: 'active' });
      const r = await service.getStatus('o1');
      expect(r.planName).toBe('Professional');
      expect(r.systemLimit).toBe(15);
      expect(r.features).toContain('All 5 Agents');
      expect(r.features).toContain('API Access');
    });

    it('should show inactive for FREE plan', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'FREE', stripeSubscriptionStatus: null });
      const r = await service.getStatus('o1');
      expect(r.hasActiveSubscription).toBe(false);
      expect(r.status).toBe('inactive');
    });

    it('should throw for unknown org', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('bad')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCheckout', () => {
    it('should reject ENTERPRISE plan (custom pricing)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'FREE' });
      await expect(service.createCheckout('o1', 'u1', 'ENTERPRISE', 'month')).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid plan', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', plan: 'FREE' });
      await expect(service.createCheckout('o1', 'u1', 'INVALID_PLAN', 'month')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPortal', () => {
    it('should reject org without subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'o1', stripeCustomerId: null });
      await expect(service.createPortal('o1')).rejects.toThrow(BadRequestException);
    });
  });
});

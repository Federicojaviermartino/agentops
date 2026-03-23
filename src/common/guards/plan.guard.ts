import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.module';

// Plan hierarchy: FREE < STARTER < PROFESSIONAL < ENTERPRISE
const PLAN_LEVEL: Record<string, number> = { FREE: 0, STARTER: 1, PROFESSIONAL: 2, ENTERPRISE: 3 };

export const RequirePlan = (minPlan: string) => SetMetadata('minPlan', minPlan);

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minPlan = this.reflector.get<string>('minPlan', context.getHandler());
    if (!minPlan) return true; // No plan requirement

    const req = context.switchToHttp().getRequest();
    const orgId = req.user?.organizationId;
    if (!orgId) return true; // No auth context

    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
    const userLevel = PLAN_LEVEL[org?.plan || 'FREE'] ?? 0;
    const requiredLevel = PLAN_LEVEL[minPlan] ?? 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenException({
        message: `This feature requires the ${minPlan} plan or higher. Your current plan: ${org?.plan || 'FREE'}.`,
        currentPlan: org?.plan || 'FREE',
        requiredPlan: minPlan,
        upgradeUrl: '/api/v1/billing/checkout',
      });
    }
    return true;
  }
}

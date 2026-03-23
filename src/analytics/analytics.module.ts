import { Controller, Get, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}
  async getExecutiveSummary(orgId: string) {
    const [totalSystems, findingsSummary, recentAssessments, monitoringAlerts] = await Promise.all([
      this.prisma.aiSystem.count({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.complianceFinding.groupBy({ by: ['severity'], where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }),
      this.prisma.assessment.count({ where: { organizationId: orgId, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      this.prisma.monitoringEvent.count({ where: { organizationId: orgId, acknowledged: false } }),
    ]);
    const byCompliance = await this.prisma.aiSystem.groupBy({ by: ['complianceStatus'], where: { organizationId: orgId, deletedAt: null }, _count: true });
    const byRisk = await this.prisma.aiSystem.groupBy({ by: ['riskLevel'], where: { organizationId: orgId, deletedAt: null }, _count: true });
    const critical = findingsSummary.find(g => g.severity === 'CRITICAL')?._count || 0;
    const high = findingsSummary.find(g => g.severity === 'HIGH')?._count || 0;
    const totalOpen = findingsSummary.reduce((s, g) => s + g._count, 0);
    const compliant = byCompliance.find(g => g.complianceStatus === 'COMPLIANT')?._count || 0;
    const deadline = new Date('2026-08-02T00:00:00Z');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    return {
      totalSystems, assessmentsLast30Days: recentAssessments, monitoringAlerts,
      findings: { totalOpen, critical, high, medium: findingsSummary.find(g => g.severity === 'MEDIUM')?._count || 0, low: findingsSummary.find(g => g.severity === 'LOW')?._count || 0 },
      riskScore: Math.min(100, critical * 25 + high * 10),
      compliance: { ...byCompliance.reduce((a: any, g) => ({ ...a, [g.complianceStatus]: g._count }), {}), rate: totalSystems > 0 ? Math.round((compliant / totalSystems) * 100) : 0 },
      riskDistribution: byRisk.reduce((a: any, g) => ({ ...a, [g.riskLevel || 'NONE']: g._count }), {}),
      deadline: { date: '2026-08-02', daysLeft, onTrack: critical === 0 || daysLeft > 180 },
    };
  }
  async getComplianceTrend(orgId: string, days = 90) {
    const assessments = await this.prisma.assessment.findMany({
      where: { organizationId: orgId, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - days * 86400000) } },
      select: { completedAt: true, overallScore: true, aiSystem: { select: { name: true } } },
      orderBy: { completedAt: 'asc' },
    });
    return assessments.map(a => ({ date: a.completedAt?.toISOString().split('T')[0], score: a.overallScore, system: a.aiSystem?.name }));
  }
  async getResolutionVelocity(orgId: string) {
    const resolved = await this.prisma.complianceFinding.findMany({
      where: { organizationId: orgId, status: { in: ['RESOLVED', 'VERIFIED'] }, resolvedAt: { not: null } },
      select: { severity: true, createdAt: true, resolvedAt: true },
    });
    const velocity: Record<string, { count: number; avgDays: number }> = {};
    for (const f of resolved) {
      const days = (f.resolvedAt!.getTime() - f.createdAt.getTime()) / 86400000;
      if (!velocity[f.severity]) velocity[f.severity] = { count: 0, avgDays: 0 };
      const v = velocity[f.severity];
      v.avgDays = (v.avgDays * v.count + days) / (v.count + 1);
      v.count++;
    }
    return velocity;
  }
  async getSystemComparison(orgId: string) {
    const systems = await this.prisma.aiSystem.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        assessments: { where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 1, select: { overallScore: true, completedAt: true } },
        findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { severity: true } },
      },
    });
    return systems.map(s => ({
      id: s.id, name: s.name, riskLevel: s.riskLevel, complianceStatus: s.complianceStatus,
      lastScore: s.assessments[0]?.overallScore || 0,
      lastAssessment: s.assessments[0]?.completedAt?.toISOString().split('T')[0] || null,
      openFindings: s.findings.length,
      criticalFindings: s.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length,
    }));
  }
  async getActivityLog(orgId: string, limit = 20) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}
  @Get('executive-summary') @ApiOperation({ summary: 'Executive summary' })
  summary(@CurrentUser('organizationId') o: string) { return this.analytics.getExecutiveSummary(o); }
  @Get('compliance-trend') @ApiOperation({ summary: 'Score trend' })
  trend(@CurrentUser('organizationId') o: string, @Query('days') d?: string) { return this.analytics.getComplianceTrend(o, d ? +d : 90); }
  @Get('resolution-velocity') @ApiOperation({ summary: 'Finding resolution speed' })
  velocity(@CurrentUser('organizationId') o: string) { return this.analytics.getResolutionVelocity(o); }
  @Get('system-comparison') @ApiOperation({ summary: 'Compare systems' })
  compare(@CurrentUser('organizationId') o: string) { return this.analytics.getSystemComparison(o); }
  @Get('activity-log') @ApiOperation({ summary: 'Recent activity' })
  activity(@CurrentUser('organizationId') o: string, @Query('limit') l?: string) { return this.analytics.getActivityLog(o, l ? +l : 20); }
}
@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}

import { Controller, Get, Injectable, Logger, Module, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  constructor(private prisma: PrismaService) {}
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runComplianceCheck() {
    this.logger.log('Running compliance check');
    const systems = await this.prisma.aiSystem.findMany({
      where: { deletedAt: null, riskLevel: { in: ['HIGH', 'LIMITED'] } },
      include: { findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { severity: true } } },
    });
    const deadline = new Date('2026-08-02T00:00:00Z');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    for (const sys of systems) {
      const critical = sys.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
      // Stale assessment check
      if (sys.lastAssessmentAt) {
        const daysSince = (Date.now() - sys.lastAssessmentAt.getTime()) / 86400000;
        if (daysSince > 90) {
          await this.createEvent(sys.id, sys.organizationId, 'COMPLIANCE_DRIFT', 'HIGH',
            'Assessment overdue', `Last assessment was ${Math.round(daysSince)} days ago. Art. 9 requires continuous risk management.`);
        }
      }
      // Deadline pressure
      if (critical > 0 && daysLeft < 180) {
        await this.createEvent(sys.id, sys.organizationId, 'DEADLINE_WARNING', 'CRITICAL',
          `${daysLeft} days to deadline with ${critical} critical findings`,
          `"${sys.name}" has ${critical} critical/high findings with ${daysLeft} days until Aug 2, 2026 enforcement.`);
      }
    }
    this.logger.log(`Compliance check done: ${systems.length} systems`);
  }
  @Cron(CronExpression.EVERY_WEEK)
  async runDocFreshnessCheck() {
    const expired = await this.prisma.generatedDocument.findMany({
      where: { expiresAt: { lte: new Date() } },
      include: { aiSystem: { select: { id: true, name: true, organizationId: true } } },
    });
    for (const doc of expired) {
      if (doc.aiSystem) {
        await this.createEvent(doc.aiSystem.id, doc.aiSystem.organizationId, 'DOC_EXPIRY', 'MEDIUM',
          `Document expired: ${doc.title}`, `${doc.docType} (v${doc.version}) expired. Regenerate per Art. 11.`);
      }
    }
  }
  private async createEvent(aiSystemId: string | null, orgId: string, type: string, severity: string, title: string, desc: string) {
    const existing = await this.prisma.monitoringEvent.findFirst({
      where: { organizationId: orgId, aiSystemId, eventType: type as any, title, createdAt: { gte: new Date(Date.now() - 86400000) } },
    });
    if (existing) return;
    return this.prisma.monitoringEvent.create({
      data: { aiSystemId, organizationId: orgId, eventType: type as any, severity: severity as any, title, description: desc },
    });
  }
  async listEvents(orgId: string, filters?: { aiSystemId?: string; severity?: string; acknowledged?: string; limit?: number }) {
    const where: any = { organizationId: orgId };
    if (filters?.aiSystemId) where.aiSystemId = filters.aiSystemId;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.acknowledged !== undefined) where.acknowledged = filters.acknowledged === 'true';
    return this.prisma.monitoringEvent.findMany({
      where, include: { aiSystem: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }, take: Math.min(filters?.limit || 50, 100),
    });
  }
  async getSummary(orgId: string) {
    const [total, unack, bySev] = await Promise.all([
      this.prisma.monitoringEvent.count({ where: { organizationId: orgId } }),
      this.prisma.monitoringEvent.count({ where: { organizationId: orgId, acknowledged: false } }),
      this.prisma.monitoringEvent.groupBy({ by: ['severity'], where: { organizationId: orgId, acknowledged: false }, _count: true }),
    ]);
    const deadline = new Date('2026-08-02T00:00:00Z');
    return { total, unacknowledged: unack, daysToDeadline: Math.ceil((deadline.getTime() - Date.now()) / 86400000), bySeverity: bySev.reduce((a: any, g) => ({ ...a, [g.severity]: g._count }), {}) };
  }
  async acknowledge(id: string, orgId: string, userId: string) {
    return this.prisma.monitoringEvent.updateMany({ where: { id, organizationId: orgId }, data: { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() } });
  }
}
@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private service: MonitoringService) {}
  @Get('events') @ApiOperation({ summary: 'List events' })
  events(@CurrentUser('organizationId') orgId: string, @Query('aiSystemId') sid?: string, @Query('severity') sev?: string, @Query('acknowledged') ack?: string) {
    return this.service.listEvents(orgId, { aiSystemId: sid, severity: sev, acknowledged: ack });
  }
  @Get('events/summary') @ApiOperation({ summary: 'Monitoring summary' })
  summary(@CurrentUser('organizationId') orgId: string) { return this.service.getSummary(orgId); }
  @Patch('events/:id/acknowledge') @ApiOperation({ summary: 'Acknowledge event' })
  ack(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string, @CurrentUser('id') uid: string) {
    return this.service.acknowledge(id, orgId, uid);
  }
  @Post('run/compliance') @ApiOperation({ summary: 'Trigger compliance check' })
  runCompliance() { return this.service.runComplianceCheck().then(() => ({ triggered: true })); }
  @Post('run/docs') @ApiOperation({ summary: 'Trigger doc freshness check' })
  runDocs() { return this.service.runDocFreshnessCheck().then(() => ({ triggered: true })); }
}
@Module({
  imports: [PrismaModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}

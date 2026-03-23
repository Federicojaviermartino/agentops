import { ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

interface TimelineEvent { id: string; date: string; type: string; category: 'ASSESSMENT'|'FINDING'|'DOCUMENT'|'MONITORING'|'SYSTEM'|'MILESTONE'; title: string; description: string; severity?: string; systemName?: string; icon: string; }

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async getTimeline(orgId: string, days = 90): Promise<TimelineEvent[]> {
    const since = new Date(Date.now() - days * 86400000);
    const [assessments, findings, documents, events, systems] = await Promise.all([
      this.prisma.assessment.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, include: { aiSystem: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.complianceFinding.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, include: { aiSystem: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.generatedDocument.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, include: { aiSystem: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.monitoringEvent.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.aiSystem.findMany({ where: { organizationId: orgId, createdAt: { gte: since }, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    ]);

    const timeline: TimelineEvent[] = [
      ...assessments.map(a => ({ id: `a-${a.id}`, date: a.createdAt.toISOString(), type: `Assessment ${a.status}`, category: 'ASSESSMENT' as const, title: `${a.type} assessment ${a.status.toLowerCase()}`, description: a.overallScore != null ? `Score: ${a.overallScore}/100` : `Status: ${a.status}`, systemName: a.aiSystem?.name, icon: '▦' })),
      ...findings.map(f => ({ id: `f-${f.id}`, date: f.createdAt.toISOString(), type: 'Finding Created', category: 'FINDING' as const, title: f.title, description: `${f.articleRef} - ${f.category}`, severity: f.severity, systemName: f.aiSystem?.name, icon: '⚑' })),
      ...documents.map(d => ({ id: `d-${d.id}`, date: d.createdAt.toISOString(), type: 'Document Generated', category: 'DOCUMENT' as const, title: d.title, description: `${d.docType} v${d.version}`, systemName: d.aiSystem?.name, icon: '◧' })),
      ...events.map(e => ({ id: `e-${e.id}`, date: e.createdAt.toISOString(), type: e.eventType, category: 'MONITORING' as const, title: e.title, description: e.description || '', severity: e.severity, icon: '◈' })),
      ...systems.map(s => ({ id: `s-${s.id}`, date: s.createdAt.toISOString(), type: 'System Registered', category: 'SYSTEM' as const, title: `${s.name} registered`, description: `${s.sector || 'N/A'} - ${s.riskLevel || 'Unclassified'}`, systemName: s.name, icon: '⬡' })),
    ];

    // Add milestone: EU AI Act deadline
    const deadline = new Date('2026-08-02T00:00:00Z');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    if (daysLeft > 0 && daysLeft <= days) {
      timeline.push({ id: 'milestone-deadline', date: deadline.toISOString(), type: 'Deadline', category: 'MILESTONE', title: 'EU AI Act Enforcement', description: `High-risk AI system obligations become enforceable. ${daysLeft} days remaining.`, icon: '⚠' });
    }

    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

@Controller('timeline')
export class TimelineController {
  constructor(private s: TimelineService) {}
  @Get() @ApiOperation({ summary: 'Get items timeline' }) get(@CurrentUser('organizationId') o: string, @Query('days') d?: string) { return this.s.getTimeline(o, d ? +d : 90); }
}

@Module({ imports: [PrismaModule], controllers: [TimelineController], providers: [TimelineService], exports: [TimelineService] })
export class TimelineModule {}

import { Response } from 'express';
import { Controller, Get, Injectable, Module, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportFindings(orgId: string, format: 'csv' | 'json' = 'csv') {
    const findings = await this.prisma.complianceFinding.findMany({
      where: { organizationId: orgId },
      include: { aiSystem: { select: { name: true } } },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });

    if (format === 'json') return findings;

    const headers = ['ID', 'System', 'Severity', 'Category', 'Article', 'Title', 'Status', 'Effort', 'Created', 'Resolved'];
    const rows = findings.map(f => [f.id.substring(0, 8), f.aiSystem?.name || '', f.severity, f.category, f.articleRef, `"${f.title.replace(/"/g, '""')}"`, f.status, f.estimatedEffort, f.createdAt.toISOString().split('T')[0], f.resolvedAt?.toISOString().split('T')[0] || '']);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportSystems(orgId: string, format: 'csv' | 'json' = 'csv') {
    const systems = await this.prisma.aiSystem.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } } },
    });

    if (format === 'json') return systems;

    const headers = ['ID', 'Name', 'Version', 'Sector', 'Risk Level', 'Compliance', 'Open Findings', 'Data Types', 'Created'];
    const rows = systems.map(s => [s.id.substring(0, 8), `"${s.name}"`, s.version, s.sector || '', s.riskLevel || 'N/A', s.complianceStatus, s.findings.length, `"${s.dataTypes?.join('; ') || ''}"`, s.createdAt.toISOString().split('T')[0]]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportAssessments(orgId: string, format: 'csv' | 'json' = 'csv') {
    const assessments = await this.prisma.assessment.findMany({
      where: { organizationId: orgId },
      include: { aiSystem: { select: { name: true } }, results: true },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'json') return assessments;

    const headers = ['ID', 'System', 'Type', 'Status', 'Score', 'Agents', 'Started', 'Completed'];
    const rows = assessments.map(a => [a.id.substring(0, 8), a.aiSystem?.name || '', a.type, a.status, a.overallScore?.toString() || '', `"${a.results.map(r => `${r.agentType}:${r.score != null ? Math.round(r.score as number) : '-'}`).join(', ')}"`, a.createdAt.toISOString().split('T')[0], a.completedAt?.toISOString().split('T')[0] || '']);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportAuditLog(orgId: string, format: 'csv' | 'json' = 'csv') {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    if (format === 'json') return logs;

    const headers = ['Timestamp', 'Action', 'Resource', 'User', 'IP', 'Details'];
    const rows = logs.map(l => [l.createdAt.toISOString(), l.action, l.resource, l.userName || '', l.ipAddress || '', `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportComplianceEvidence(orgId: string) {
    const [org, systems, findings, assessments, documents, events, logs] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.aiSystem.findMany({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.complianceFinding.findMany({ where: { organizationId: orgId } }),
      this.prisma.assessment.findMany({ where: { organizationId: orgId }, include: { results: true } }),
      this.prisma.generatedDocument.findMany({ where: { organizationId: orgId } }),
      this.prisma.monitoringEvent.findMany({ where: { organizationId: orgId } }),
      this.prisma.auditLog.findMany({ where: { organizationId: orgId }, take: 500 }),
    ]);

    return {
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        format: 'AgentOps Compliance Evidence Package',
        regulation: 'EU AI Act (Regulation EU 2024/1689)',
        organization: org?.name,
        purpose: 'Regulatory compliance evidence for market surveillance authorities',
      },
      summary: {
        totalSystems: systems.length,
        highRiskSystems: systems.filter(s => s.riskLevel === 'HIGH').length,
        compliantSystems: systems.filter(s => s.complianceStatus === 'COMPLIANT').length,
        totalFindings: findings.length,
        openFindings: findings.filter(f => ['OPEN', 'IN_PROGRESS'].includes(f.status)).length,
        resolvedFindings: findings.filter(f => ['RESOLVED', 'VERIFIED'].includes(f.status)).length,
        assessmentsCompleted: assessments.filter(a => a.status === 'COMPLETED').length,
        documentsGenerated: documents.length,
      },
      systems, findings, assessments, documents,
      monitoringEvents: events,
      auditTrail: logs,
    };
  }
}

@Controller('export')
export class ExportController {
  constructor(private s: ExportService) {}

  @Get('findings') @ApiOperation({ summary: 'Export findings (CSV/JSON)' })
  async findings(@CurrentUser('organizationId') o: string, @Query('format') f: string, @Res() res: Response) {
    const data = await this.s.exportFindings(o, (f === 'json' ? 'json' : 'csv') as any);
    if (f === 'json') { res.json(data); } else { res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="findings-${new Date().toISOString().split('T')[0]}.csv"` }); res.send(data); }
  }

  @Get('systems') @ApiOperation({ summary: 'Export AI systems (CSV/JSON)' })
  async systems(@CurrentUser('organizationId') o: string, @Query('format') f: string, @Res() res: Response) {
    const data = await this.s.exportSystems(o, (f === 'json' ? 'json' : 'csv') as any);
    if (f === 'json') { res.json(data); } else { res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="systems-${new Date().toISOString().split('T')[0]}.csv"` }); res.send(data); }
  }

  @Get('assessments') @ApiOperation({ summary: 'Export assessments (CSV/JSON)' })
  async assessments(@CurrentUser('organizationId') o: string, @Query('format') f: string, @Res() res: Response) {
    const data = await this.s.exportAssessments(o, (f === 'json' ? 'json' : 'csv') as any);
    if (f === 'json') { res.json(data); } else { res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="assessments-${new Date().toISOString().split('T')[0]}.csv"` }); res.send(data); }
  }

  @Get('audit-log') @ApiOperation({ summary: 'Export audit log (CSV/JSON)' })
  async auditLog(@CurrentUser('organizationId') o: string, @Query('format') f: string, @Res() res: Response) {
    const data = await this.s.exportAuditLog(o, (f === 'json' ? 'json' : 'csv') as any);
    if (f === 'json') { res.json(data); } else { res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"` }); res.send(data); }
  }

  @Get('evidence') @ApiOperation({ summary: 'Export compliance evidence package' }) @UseGuards(RolesGuard) @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER')
  async evidence(@CurrentUser('organizationId') o: string, @Res() res: Response) {
    const data = await this.s.exportComplianceEvidence(o);
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="compliance-evidence-${new Date().toISOString().split('T')[0]}.json"` });
    res.send(JSON.stringify(data, null, 2));
  }
}

@Module({ imports: [PrismaModule], controllers: [ExportController], providers: [ExportService] })
export class ExportModule {}

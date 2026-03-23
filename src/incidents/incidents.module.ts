import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';
import * as crypto from 'crypto';

// Incident is stored in org settings JSON since we don't want to add Prisma model now
interface Incident { id: string; aiSystemId: string; aiSystemName: string; title: string; description: string; severity: 'DEATH' | 'SERIOUS_HEALTH' | 'INFRASTRUCTURE_DISRUPTION' | 'FUNDAMENTAL_RIGHTS' | 'OTHER'; status: 'DETECTED' | 'INITIAL_REPORT_DUE' | 'INITIAL_REPORT_SENT' | 'DETAILED_REPORT_DUE' | 'DETAILED_REPORT_SENT' | 'CLOSED'; detectedAt: string; initialReportDue: string; detailedReportDue: string; initialReportSentAt?: string; detailedReportSentAt?: string; reportedBy: string; authorityNotified?: string; correctiveActions: string[]; timeline: { date: string; action: string; by: string }[]; }

class CreateIncidentDto { @IsString() aiSystemId: string; @IsString() title: string; @IsString() description: string; @IsString() severity: string; }

class UpdateIncidentDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsString() authorityNotified?: string; @IsOptional() correctiveActions?: string[]; @IsOptional() @IsString() notes?: string; }

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);
  constructor(private prisma: PrismaService) {}

  private async getIncidents(orgId: string): Promise<Incident[]> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return ((org?.settings as any)?.incidents || []) as Incident[];
  }

  private async saveIncidents(orgId: string, incidents: Incident[]) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const settings = (org?.settings as any) || {};
    settings.incidents = incidents;
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings } });
  }

  async create(orgId: string, dto: CreateIncidentDto, userId: string) {
    const system = await this.prisma.aiSystem.findFirst({ where: { id: dto.aiSystemId, organizationId: orgId } });
    if (!system) throw new BadRequestException('AI System not found');

    const now = new Date();
    const incident: Incident = {
      id: require('crypto').randomUUID(),
      aiSystemId: dto.aiSystemId, aiSystemName: system.name,
      title: dto.title, description: dto.description,
      severity: dto.severity as any,
      status: 'DETECTED',
      detectedAt: now.toISOString(),
      initialReportDue: new Date(now.getTime() + 72 * 3600000).toISOString(), // 72 hours
      detailedReportDue: new Date(now.getTime() + 15 * 86400000).toISOString(), // 15 days
      reportedBy: userId, correctiveActions: [],
      timeline: [{ date: now.toISOString(), action: 'Incident detected and logged', by: userId }],
    };

    const incidents = await this.getIncidents(orgId);
    incidents.push(incident);
    await this.saveIncidents(orgId, incidents);

    this.logger.warn(`SERIOUS INCIDENT created: ${dto.title} (${system.name}) - 72h report due: ${incident.initialReportDue}`);
    return incident;
  }

  async list(orgId: string) {
    const incidents = await this.getIncidents(orgId);
    return incidents.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }

  async getById(orgId: string, id: string) {
    const incidents = await this.getIncidents(orgId);
    return incidents.find(i => i.id === id) || null;
  }

  async update(orgId: string, id: string, dto: UpdateIncidentDto, userId: string) {
    const incidents = await this.getIncidents(orgId);
    const idx = incidents.findIndex(i => i.id === id);
    if (idx === -1) throw new BadRequestException('Incident not found');

    const inc = incidents[idx];
    const now = new Date().toISOString();

    if (dto.status) {
      inc.status = dto.status as any;
      inc.timeline.push({ date: now, action: `Status changed to ${dto.status}`, by: userId });
      if (dto.status === 'INITIAL_REPORT_SENT') inc.initialReportSentAt = now;
      if (dto.status === 'DETAILED_REPORT_SENT') inc.detailedReportSentAt = now;
    }
    if (dto.authorityNotified) { inc.authorityNotified = dto.authorityNotified; inc.timeline.push({ date: now, action: `Authority notified: ${dto.authorityNotified}`, by: userId }); }
    if (dto.correctiveActions) { inc.correctiveActions = dto.correctiveActions; }
    if (dto.notes) { inc.timeline.push({ date: now, action: dto.notes, by: userId }); }

    incidents[idx] = inc;
    await this.saveIncidents(orgId, incidents);
    return inc;
  }

  async getOverdueReports(orgId: string) {
    const incidents = await this.getIncidents(orgId);
    const now = Date.now();
    return {
      initialOverdue: incidents.filter(i => i.status === 'DETECTED' && new Date(i.initialReportDue).getTime() < now),
      detailedOverdue: incidents.filter(i => ['INITIAL_REPORT_SENT', 'DETAILED_REPORT_DUE'].includes(i.status) && new Date(i.detailedReportDue).getTime() < now),
      upcoming72h: incidents.filter(i => i.status === 'DETECTED' && new Date(i.initialReportDue).getTime() > now && new Date(i.initialReportDue).getTime() - now < 24 * 3600000),
    };
  }

  generateInitialReportTemplate(incident: Incident) {
    return {
      title: `Serious Incident Report - Initial Notification (Art. 73)`,
      sections: [
        { heading: '1. Provider Information', content: 'Name, address, contact details of the AI system provider.' },
        { heading: '2. AI System Identification', content: `System: ${incident.aiSystemName}\nIncident ID: ${incident.id}` },
        { heading: '3. Incident Description', content: incident.description },
        { heading: '4. Severity Classification', content: `Type: ${incident.severity}\nDetected: ${incident.detectedAt}` },
        { heading: '5. Immediate Actions Taken', content: incident.correctiveActions.join('\n') || 'None documented yet.' },
        { heading: '6. Preliminary Assessment', content: 'To be completed by the compliance team.' },
      ],
      dueDate: incident.initialReportDue,
      authority: 'National market surveillance authority of the Member State where the incident occurred.',
      legalBasis: 'Art. 73 Regulation (EU) 2024/1689',
    };
  }
}

@ApiTags('Incidents') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('incidents')
export class IncidentsController {
  constructor(private s: IncidentsService) {}
  @Get() @ApiOperation({ summary: 'List all incidents' }) list(@CurrentUser('organizationId') o: string) { return this.s.list(o); }
  @Get('overdue') @ApiOperation({ summary: 'List overdue incidents past 72h/15d deadlines' }) overdue(@CurrentUser('organizationId') o: string) { return this.s.getOverdueReports(o); }
  @Get(':id') @ApiOperation({ summary: 'Get by ID incidents' }) getOne(@Param('id') id: string, @CurrentUser('organizationId') o: string) { return this.s.getById(o, id); }
  @Get(':id/report-template') @ApiOperation({ summary: 'Get incident report template (Art. 73)' }) template(@Param('id') id: string, @CurrentUser('organizationId') o: string) { return this.s.getById(o, id).then(i => i ? this.s.generateInitialReportTemplate(i) : null); }
  @Post() @ApiOperation({ summary: 'Create new incidents' }) @UseGuards(RolesGuard) @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') create(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Body() d: CreateIncidentDto) { return this.s.create(o, d, u); }
  @Patch(':id') @ApiOperation({ summary: 'Update' }) @UseGuards(RolesGuard) @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') update(@Param('id') id: string, @CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Body() d: UpdateIncidentDto) { return this.s.update(o, id, d, u); }
}

@Module({ imports: [PrismaModule], controllers: [IncidentsController], providers: [IncidentsService], exports: [IncidentsService] })
export class IncidentsModule {}

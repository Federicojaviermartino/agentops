import { Body, Controller, Get, Injectable, Module, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';

class UpdateOrgDto { @IsOptional() @IsString() name?: string; @IsOptional() settings?: Record<string, any>; }

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}
  async getOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const [users, systems, findings] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: orgId } }),
      this.prisma.aiSystem.count({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.complianceFinding.count({ where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return { ...org, stats: { users, systems, openFindings: findings } };
  }
  async updateOrg(orgId: string, dto: UpdateOrgDto) {
    return this.prisma.organization.update({ where: { id: orgId }, data: { ...(dto.name && { name: dto.name }), ...(dto.settings && { settings: dto.settings }) } });
  }
  async exportData(orgId: string) {
    const [org, users, systems, findings, assessments] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true, email: true, name: true, role: true, createdAt: true } }),
      this.prisma.aiSystem.findMany({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.complianceFinding.findMany({ where: { organizationId: orgId } }),
      this.prisma.assessment.findMany({ where: { organizationId: orgId }, include: { results: true } }),
    ]);
    return { exportedAt: new Date().toISOString(), organization: org, users, aiSystems: systems, findings, assessments };
  }
  async getAuditLog(orgId: string) {
    return this.prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private s: SettingsService) {}
  @Get('organization') @ApiOperation({ summary: 'Get organization details' }) getOrg(@CurrentUser('organizationId') o: string) { return this.s.getOrg(o); }
  @Patch('organization') @ApiOperation({ summary: 'Update organization settings' }) @UseGuards(RolesGuard) @Roles('OWNER','ADMIN') updateOrg(@CurrentUser('organizationId') o: string, @Body() d: UpdateOrgDto) { return this.s.updateOrg(o, d); }
  @Get('export') @ApiOperation({ summary: 'Export all org data (GDPR Art. 20)' }) @UseGuards(RolesGuard) @Roles('OWNER') exportData(@CurrentUser('organizationId') o: string) { return this.s.exportData(o); }
  @Get('audit-log') @ApiOperation({ summary: 'Get organization audit log' }) auditLog(@CurrentUser('organizationId') o: string) { return this.s.getAuditLog(o); }
}

@Module({ imports: [PrismaModule], controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}

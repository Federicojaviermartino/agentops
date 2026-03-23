import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';

@Injectable()
export class FindingsService {
  constructor(private prisma: PrismaService) {}
  async createFinding(dto: {
    aiSystemId: string; assessmentId: string; organizationId: string;
    articleRef: string; severity: string; category: string;
    title: string; description: string; remediation: string; estimatedEffort?: string;
  }) {
    return this.prisma.complianceFinding.create({
      data: {
        aiSystemId: dto.aiSystemId, assessmentId: dto.assessmentId, organizationId: dto.organizationId,
        articleRef: dto.articleRef, severity: dto.severity as any, category: dto.category as any,
        title: dto.title, description: dto.description, remediation: dto.remediation,
        estimatedEffort: (dto.estimatedEffort || 'DAYS') as any, status: 'OPEN',
      },
    });
  }
  async list(orgId: string, filters?: { aiSystemId?: string; severity?: string; status?: string; category?: string; page?: number; limit?: number }) {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const where: any = { organizationId: orgId };
    if (filters?.aiSystemId) where.aiSystemId = filters.aiSystemId;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    const [items, total] = await Promise.all([
      this.prisma.complianceFinding.findMany({
        where, include: { aiSystem: { select: { id: true, name: true, riskLevel: true } } },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.complianceFinding.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async getById(id: string, orgId: string) {
    const finding = await this.prisma.complianceFinding.findFirst({
      where: { id, organizationId: orgId },
      include: {
        aiSystem: { select: { id: true, name: true, riskLevel: true } },
        assessment: { select: { id: true, type: true, createdAt: true } },
      },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    return finding;
  }
  async updateStatus(id: string, orgId: string, newStatus: string, resolvedBy?: string, resolution?: string) {
    const finding = await this.getById(id, orgId);
    const valid: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'ACCEPTED', 'FALSE_POSITIVE'],
      IN_PROGRESS: ['RESOLVED', 'OPEN'],
      RESOLVED: ['VERIFIED', 'OPEN'],
      VERIFIED: [],
      ACCEPTED: ['OPEN'],
      FALSE_POSITIVE: ['OPEN'],
    };
    if (!(valid[finding.status] || []).includes(newStatus)) {
      throw new Error(`Invalid transition from ${finding.status} to ${newStatus}`);
    }
    const data: any = { status: newStatus };
    if (['RESOLVED', 'VERIFIED'].includes(newStatus)) {
      data.resolvedAt = new Date();
      data.resolvedBy = resolvedBy;
      if (resolution) data.resolution = resolution;
    }
    const updated = await this.prisma.complianceFinding.update({ where: { id }, data });
    await this.recalculateCompliance(finding.aiSystemId);
    return updated;
  }
  async getSummary(orgId: string) {
    const [bySeverity, byStatus, byCategory] = await Promise.all([
      this.prisma.complianceFinding.groupBy({ by: ['severity'], where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }),
      this.prisma.complianceFinding.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
      this.prisma.complianceFinding.groupBy({ by: ['category'], where: { organizationId: orgId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }),
    ]);
    const critical = bySeverity.find((g) => g.severity === 'CRITICAL')?._count || 0;
    const high = bySeverity.find((g) => g.severity === 'HIGH')?._count || 0;
    const totalOpen = bySeverity.reduce((sum, g) => sum + g._count, 0);
    return {
      totalOpen, critical, high,
      medium: bySeverity.find((g) => g.severity === 'MEDIUM')?._count || 0,
      low: bySeverity.find((g) => g.severity === 'LOW')?._count || 0,
      byStatus: byStatus.reduce((a: any, g) => ({ ...a, [g.status]: g._count }), {}),
      byCategory: byCategory.reduce((a: any, g) => ({ ...a, [g.category]: g._count }), {}),
      riskScore: Math.min(100, critical * 25 + high * 10),
    };
  }
  private async recalculateCompliance(aiSystemId: string) {
    const openCritical = await this.prisma.complianceFinding.count({
      where: { aiSystemId, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: { in: ['CRITICAL', 'HIGH'] } },
    });
    const openMedium = await this.prisma.complianceFinding.count({
      where: { aiSystemId, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: 'MEDIUM' },
    });
    let status = 'COMPLIANT';
    if (openCritical > 0) status = 'NON_COMPLIANT';
    else if (openMedium > 0) status = 'PARTIAL';
    await this.prisma.aiSystem.update({ where: { id: aiSystemId }, data: { complianceStatus: status as any } });
  }
}
@ApiTags('Findings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('findings')
export class FindingsController {
  constructor(private service: FindingsService) {}
  @Get() @ApiOperation({ summary: 'List findings' })
  list(@CurrentUser('organizationId') orgId: string, @Query('aiSystemId') aiSystemId?: string, @Query('severity') severity?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list(orgId, { aiSystemId, severity, status, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Get('summary') @ApiOperation({ summary: 'Findings summary' })
  summary(@CurrentUser('organizationId') orgId: string) { return this.service.getSummary(orgId); }
  @Get(':id') @ApiOperation({ summary: 'Get finding' })
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string) { return this.service.getById(id, orgId); }
  @Patch(':id/status') @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Update finding status' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string, @CurrentUser('id') userId: string, @Body() body: { status: string; resolution?: string }) {
    return this.service.updateStatus(id, orgId, body.status, userId, body.resolution);
  }
}
@Module({
  imports: [PrismaModule],
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}

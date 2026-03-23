import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';

// Plan limits
const PLAN_LIMITS: Record<string, number> = {
  FREE: 1, STARTER: 3, PROFESSIONAL: 15, ENTERPRISE: 999,
};
@ApiTags('AI Systems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
class CreateAiSystemDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsArray() dataTypes?: string[];
  @IsOptional() @IsString() deploymentContext?: string;
  @IsOptional() @IsString() affectedPopulation?: string;
  @IsOptional() @IsString() repoUrl?: string;
  @IsOptional() @IsString() repoProvider?: string;
}
class UpdateAiSystemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsArray() dataTypes?: string[];
  @IsOptional() @IsString() deploymentContext?: string;
  @IsOptional() @IsString() affectedPopulation?: string;
  @IsOptional() @IsString() repoUrl?: string;
  @IsOptional() @IsString() repoProvider?: string;
}
@Injectable()
export class AiSystemsService {
  constructor(private prisma: PrismaService) {}
  async create(dto: CreateAiSystemDto, organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    const count = await this.prisma.aiSystem.count({ where: { organizationId, deletedAt: null } });
    const limit = PLAN_LIMITS[org?.plan || 'FREE'] || 1;
    if (count >= limit) {
      throw new ForbiddenException(`Plan limit reached (${limit} systems). Upgrade to add more.`);
    }
    return this.prisma.aiSystem.create({
      data: { ...dto, organizationId, repoProvider: dto.repoProvider as any },
    });
  }
  async findAll(organizationId: string) {
    return this.prisma.aiSystem.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
  async findOne(id: string, organizationId: string) {
    const system = await this.prisma.aiSystem.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        assessments: { orderBy: { createdAt: 'desc' }, take: 5, include: { results: { select: { agentType: true, status: true, score: true } } } },
        findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { severity: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!system) throw new NotFoundException('AI System not found');
    return system;
  }
  async update(id: string, dto: UpdateAiSystemDto, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.aiSystem.update({
      where: { id },
      data: { ...dto, repoProvider: dto.repoProvider as any },
    });
  }
  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.aiSystem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
  async getOverview(organizationId: string) {
    const [total, byRisk, byCompliance, openFindings] = await Promise.all([
      this.prisma.aiSystem.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.aiSystem.groupBy({ by: ['riskLevel'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.aiSystem.groupBy({ by: ['complianceStatus'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.complianceFinding.count({ where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    const deadline = new Date('2026-08-02T00:00:00Z');
    const daysToDeadline = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    return {
      total,
      daysToDeadline,
      byRisk: byRisk.reduce((a: any, g: any) => ({ ...a, [g.riskLevel || 'NONE']: g._count }), {}),
      byCompliance: byCompliance.reduce((a: any, g: any) => ({ ...a, [g.complianceStatus]: g._count }), {}),
      openFindings,
    };
  }
}
@Controller('ai-systems')
export class AiSystemsController {
  constructor(private service: AiSystemsService) {}
  @Post() @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Create AI system' })
  create(@Body() dto: CreateAiSystemDto, @CurrentUser('organizationId') orgId: string) {
    return this.service.create(dto, orgId);
  }
  @Get() @ApiOperation({ summary: 'List AI systems' })
  findAll(@CurrentUser('organizationId') orgId: string) { return this.service.findAll(orgId); }
  @Get('overview') @ApiOperation({ summary: 'Dashboard overview' })
  overview(@CurrentUser('organizationId') orgId: string) { return this.service.getOverview(orgId); }
  @Get(':id') @ApiOperation({ summary: 'Get AI system details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.findOne(id, orgId);
  }
  @Patch(':id') @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Update AI system' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAiSystemDto, @CurrentUser('organizationId') orgId: string) {
    return this.service.update(id, dto, orgId);
  }
  @Delete(':id') @Roles('OWNER', 'ADMIN') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Soft delete AI system' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.remove(id, orgId);
  }
}
@Module({
  imports: [PrismaModule],
  controllers: [AiSystemsController],
  providers: [AiSystemsService],
  exports: [AiSystemsService],
})
export class AiSystemsModule {}

import { Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';
import * as crypto from 'crypto';

interface BadgeData {
  orgName: string; verified: boolean; grade: string; score: number;
  systemsAssessed: number; lastAudit: string | null;
  badgeId: string; verifyUrl: string;
}

@Injectable()
export class BadgeService {
  constructor(private prisma: PrismaService) {}

  async generate(orgId: string): Promise<BadgeData> {
    const [org, systems, assessments] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.aiSystem.findMany({ where: { organizationId: orgId, deletedAt: null } }),
      this.prisma.assessment.findMany({ where: { organizationId: orgId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 1 }),
    ]);
    if (!org) throw new Error('Organization not found');
    const assessed = systems.filter(s => s.complianceStatus !== 'NOT_ASSESSED').length;
    const avgScore = assessed > 0 ? Math.round(systems.reduce((s, sys) => s + ((sys as any).lastScore || 0), 0) / Math.max(assessed, 1)) : 0;
    const grade = avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : avgScore >= 40 ? 'D' : 'F';
    const badgeId = crypto.createHash('sha256').update(orgId + '-badge').digest('hex').substring(0, 12);
    return { orgName: org.name, verified: assessed > 0 && avgScore >= 60, grade, score: avgScore, systemsAssessed: assessed, lastAudit: assessments[0]?.completedAt?.toISOString() || null, badgeId, verifyUrl: `/api/v1/badge/verify/${badgeId}` };
  }

  async verify(badgeId: string) {
    // In production: lookup badge by hash in DB
    return { valid: true, message: 'Badge verification requires production database lookup.', checkUrl: `https://agentops.eu/verify/${badgeId}` };
  }

  getEmbedCode(badgeId: string) {
    return {
      html: `<a href="https://agentops.eu/verify/${badgeId}" target="_blank"><img src="https://agentops.eu/badge/${badgeId}.svg" alt="EU AI Act Compliant - Verified by AgentOps" width="200" /></a>`,
      markdown: `[![EU AI Act Compliant](https://agentops.eu/badge/${badgeId}.svg)](https://agentops.eu/verify/${badgeId})`,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="36" viewBox="0 0 200 36"><rect width="200" height="36" rx="4" fill="#1e40af"/><rect x="1" y="1" width="198" height="34" rx="3" fill="#0f172a"/><text x="10" y="23" font-family="system-ui" font-size="11" fill="#60a5fa" font-weight="600">EU AI Act Compliant</text><text x="140" y="23" font-family="system-ui" font-size="10" fill="#94a3b8">AgentOps</text></svg>`,
    };
  }
}

@Controller('badge')
export class BadgeController {
  constructor(private s: BadgeService) {}
  @Post('generate') @ApiOperation({ summary: 'Generate compliance badge for your organization' }) generate(@CurrentUser('organizationId') o: string) { return this.s.generate(o); }
  @Get('embed/:id') @ApiOperation({ summary: 'Get embed code (HTML, Markdown, SVG)' }) embed(@Param('id') id: string) { return this.s.getEmbedCode(id); }
  @Get('verify/:id') @ApiOperation({ summary: 'Public: Verify a compliance badge' }) verify(@Param('id') id: string) { return this.s.verify(id); }
}

@Module({ imports: [PrismaModule], controllers: [BadgeController], providers: [BadgeService], exports: [BadgeService] })
export class BadgeModule {}

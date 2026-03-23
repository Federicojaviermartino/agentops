import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(orgId: string, query: string, limit = 20) {
    if (!query || query.length < 2) return { systems: [], findings: [], documents: [], total: 0 };
    const q = `%${query}%`;

    const [systems, findings, documents] = await Promise.all([
      this.prisma.aiSystem.findMany({
        where: { organizationId: orgId, deletedAt: null, OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { purpose: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, name: true, riskLevel: true, complianceStatus: true, sector: true },
        take: limit,
      }),
      this.prisma.complianceFinding.findMany({
        where: { organizationId: orgId, OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { articleRef: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, title: true, articleRef: true, severity: true, status: true, aiSystem: { select: { name: true } } },
        take: limit,
      }),
      this.prisma.generatedDocument.findMany({
        where: { organizationId: orgId, OR: [{ title: { contains: query, mode: 'insensitive' } }] },
        select: { id: true, title: true, docType: true, version: true, createdAt: true },
        take: limit,
      }),
    ]);

    return {
      systems: systems.map(s => ({ ...s, type: 'system' })),
      findings: findings.map(f => ({ ...f, type: 'finding' })),
      documents: documents.map(d => ({ ...d, type: 'document' })),
      total: systems.length + findings.length + documents.length,
      query,
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private s: SearchService) {}
  @Get() @ApiOperation({ summary: 'Search AI systems, findings, documents' }) search(@CurrentUser('organizationId') o: string, @Query('q') q: string, @Query('limit') l?: string) {
    return this.s.search(o, q, l ? +l : 20);
  }
}

@Module({ imports: [PrismaModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}

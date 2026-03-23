import { ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

interface ScoreBreakdown { area: string; articleRef: string; score: number; weight: number; status: 'PASS'|'PARTIAL'|'FAIL'|'NOT_ASSESSED'; details: string; }

@Injectable()
export class ComplianceScoreService {
  constructor(private prisma: PrismaService) {}

  async calculateForSystem(orgId: string, systemId: string) {
    const sys = await this.prisma.aiSystem.findFirst({
      where: { id: systemId, organizationId: orgId, deletedAt: null },
      include: { findings: true, assessments: { where: { status: 'COMPLETED' }, take: 1, orderBy: { completedAt: 'desc' } }, documents: true },
    });
    if (!sys) return null;

    const open = sys.findings.filter(f => ['OPEN','IN_PROGRESS'].includes(f.status));
    const crit = open.filter(f => f.severity === 'CRITICAL').length;
    const high = open.filter(f => f.severity === 'HIGH').length;
    const med = open.filter(f => f.severity === 'MEDIUM').length;
    const hasAnnex = sys.documents.some(d => d.docType === 'ANNEX_IV');
    const hasFRIA = sys.documents.some(d => d.docType === 'FRIA');
    const bd: ScoreBreakdown[] = [];
    const fs = (cat: string) => { const cf = open.filter(f => f.category === cat); if (!cf.length) return 100; return Math.max(0, 100 - cf.filter(f=>f.severity==='CRITICAL').length*40 - cf.filter(f=>f.severity==='HIGH').length*20 - (cf.length - cf.filter(f=>f.severity==='CRITICAL').length - cf.filter(f=>f.severity==='HIGH').length)*5); };
    const fst = (cat: string): 'PASS'|'PARTIAL'|'FAIL' => { const cf = open.filter(f => f.category === cat); if (!cf.length) return 'PASS'; if (cf.some(f => f.severity === 'CRITICAL')) return 'FAIL'; return 'PARTIAL'; };

    if (sys.riskLevel === 'HIGH') {
      bd.push(
        { area: 'Classification', articleRef: 'Art. 6', score: 100, weight: 10, status: 'PASS', details: 'Classified as HIGH' },
        { area: 'Risk Management', articleRef: 'Art. 9', score: fs('RISK_MANAGEMENT'), weight: 15, status: fst('RISK_MANAGEMENT'), details: `${open.filter(f=>f.category==='RISK_MANAGEMENT').length} findings` },
        { area: 'Data Governance', articleRef: 'Art. 10', score: fs('DATA_GOVERNANCE'), weight: 15, status: fst('DATA_GOVERNANCE'), details: `${open.filter(f=>f.category==='DATA_GOVERNANCE').length} findings` },
        { area: 'Documentation', articleRef: 'Art. 11', score: hasAnnex ? 80 : 0, weight: 15, status: hasAnnex ? 'PARTIAL' : 'FAIL', details: hasAnnex ? 'Annex IV exists' : 'Missing' },
        { area: 'Logging', articleRef: 'Art. 12', score: fs('LOGGING'), weight: 10, status: fst('LOGGING'), details: `${open.filter(f=>f.category==='LOGGING').length} findings` },
        { area: 'Transparency', articleRef: 'Art. 13', score: fs('TRANSPARENCY'), weight: 10, status: fst('TRANSPARENCY'), details: `${open.filter(f=>f.category==='TRANSPARENCY').length} findings` },
        { area: 'Human Oversight', articleRef: 'Art. 14', score: fs('HUMAN_OVERSIGHT'), weight: 10, status: fst('HUMAN_OVERSIGHT'), details: `${open.filter(f=>f.category==='HUMAN_OVERSIGHT').length} findings` },
        { area: 'Accuracy', articleRef: 'Art. 15', score: fs('ACCURACY_ROBUSTNESS'), weight: 10, status: fst('ACCURACY_ROBUSTNESS'), details: `${open.filter(f=>f.category==='ACCURACY_ROBUSTNESS').length} findings` },
        { area: 'FRIA', articleRef: 'Art. 27', score: hasFRIA ? 100 : 0, weight: 5, status: hasFRIA ? 'PASS' : 'FAIL', details: hasFRIA ? 'Completed' : 'Not conducted' },
      );
    } else if (sys.riskLevel === 'LIMITED') {
      bd.push(
        { area: 'Classification', articleRef: 'Art. 6', score: 100, weight: 30, status: 'PASS', details: 'LIMITED risk' },
        { area: 'Transparency', articleRef: 'Art. 50', score: fs('TRANSPARENCY'), weight: 50, status: fst('TRANSPARENCY'), details: `${open.filter(f=>f.category==='TRANSPARENCY').length} findings` },
        { area: 'Documentation', articleRef: 'Art. 11', score: hasAnnex ? 100 : 50, weight: 20, status: hasAnnex ? 'PASS' : 'PARTIAL', details: hasAnnex ? 'Available' : 'Basic only' },
      );
    } else {
      bd.push({ area: 'Classification', articleRef: 'Art. 6', score: sys.riskLevel ? 100 : 0, weight: 100, status: sys.riskLevel ? 'PASS' : 'NOT_ASSESSED', details: sys.riskLevel ? `${sys.riskLevel} - no mandatory obligations` : 'Not classified' });
    }

    const tw = bd.reduce((s, b) => s + b.weight, 0);
    const ws = tw > 0 ? Math.round(bd.reduce((s, b) => s + (b.score * b.weight / tw), 0)) : 0;
    const grade = ws >= 90 ? 'A' : ws >= 75 ? 'B' : ws >= 60 ? 'C' : ws >= 40 ? 'D' : 'F';

    return { systemId, systemName: sys.name, riskLevel: sys.riskLevel, overallScore: ws, grade, breakdown: bd, penalties: { critical: crit, high, medium: med, deduction: Math.min(100, crit*25+high*10+med*3) }, documentation: { annexIV: hasAnnex, fria: hasFRIA } };
  }

  async calculateForOrg(orgId: string) {
    const systems = await this.prisma.aiSystem.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true } });
    const scores = (await Promise.all(systems.map(s => this.calculateForSystem(orgId, s.id)))).filter(Boolean) as any[];
    const avg = scores.length > 0 ? Math.round(scores.reduce((s: number, v: any) => s + v.overallScore, 0) / scores.length) : 0;
    return { organizationScore: avg, organizationGrade: avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg >= 40 ? 'D' : 'F', totalSystems: scores.length, systems: scores.map((v: any) => ({ id: v.systemId, name: v.systemName, score: v.overallScore, grade: v.grade })) };
  }
}

@Controller('compliance-score')
export class ComplianceScoreController {
  constructor(private s: ComplianceScoreService) {}
  @Get('organization') @ApiOperation({ summary: 'Organization compliance score (A-F grade)' }) org(@CurrentUser('organizationId') o: string) { return this.s.calculateForOrg(o); }
  @Get('system/:id') @ApiOperation({ summary: 'System compliance score breakdown' }) sys(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') o: string) { return this.s.calculateForSystem(o, id); }
}

@Module({ imports: [PrismaModule], controllers: [ComplianceScoreController], providers: [ComplianceScoreService], exports: [ComplianceScoreService] })
export class ComplianceScoreModule {}

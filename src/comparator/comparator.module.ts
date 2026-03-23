import { ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

interface RegulationMapping { regulation: string; requirement: string; articleRef: string; status: 'COMPLIANT'|'PARTIAL'|'NON_COMPLIANT'|'NOT_APPLICABLE'; agentOpsMapping: string; overlap: string[]; }

const REGULATIONS = {
  EU_AI_ACT: { name: 'EU AI Act (2024/1689)', deadline: '2026-08-02', scope: 'AI systems in EU market' },
  GDPR: { name: 'GDPR (2016/679)', deadline: 'In force', scope: 'Personal data processing' },
  ISO_42001: { name: 'ISO/IEC 42001:2023', deadline: 'Voluntary', scope: 'AI Management System' },
  NIST_AI_RMF: { name: 'NIST AI RMF 1.0', deadline: 'Voluntary (US)', scope: 'AI risk management' },
};

const CROSS_MAP: Record<string, { gdpr: string; iso42001: string; nist: string }> = {
  'Art. 9 Risk Management': { gdpr: 'Art. 35 DPIA', iso42001: '6.1 Risk Assessment', nist: 'MAP 1.1, MEASURE 2.1' },
  'Art. 10 Data Governance': { gdpr: 'Art. 5 Data Principles', iso42001: '7.4 Data Management', nist: 'MAP 3.1, MEASURE 2.6' },
  'Art. 11 Documentation': { gdpr: 'Art. 30 Records', iso42001: '7.5 Documented Information', nist: 'GOVERN 1.3' },
  'Art. 12 Logging': { gdpr: 'Art. 30 Records', iso42001: '9.1 Monitoring', nist: 'MEASURE 4.1' },
  'Art. 13 Transparency': { gdpr: 'Art. 13-14 Information', iso42001: '7.4 Communication', nist: 'GOVERN 4.1, MAP 5.1' },
  'Art. 14 Human Oversight': { gdpr: 'Art. 22 Automated Decisions', iso42001: '8.4 Operation Control', nist: 'GOVERN 6.1' },
  'Art. 15 Accuracy': { gdpr: 'Art. 5(1)(d) Accuracy', iso42001: '8.2 AI Risk Treatment', nist: 'MEASURE 1.1, MEASURE 2.5' },
  'Art. 27 FRIA': { gdpr: 'Art. 35 DPIA', iso42001: '6.1 Risk Assessment', nist: 'MAP 5.2, GOVERN 5.1' },
  'Art. 50 Transparency': { gdpr: 'Art. 13 Right to Information', iso42001: '7.4 Communication', nist: 'GOVERN 4.2' },
  'Art. 72 Post-Market': { gdpr: 'Art. 33-34 Breach Notification', iso42001: '10.1 Continual Improvement', nist: 'MANAGE 4.1' },
  'Art. 73 Incident Reporting': { gdpr: 'Art. 33 72h Breach Notification', iso42001: '10.2 Nonconformity', nist: 'MANAGE 4.2' },
};

@Injectable()
export class ComparatorService {
  constructor(private prisma: PrismaService) {}

  async compareForSystem(orgId: string, systemId: string) {
    const sys = await this.prisma.aiSystem.findFirst({
      where: { id: systemId, organizationId: orgId, deletedAt: null },
      include: { findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }, documents: true },
    });
    if (!sys) return null;

    const findingCats = sys.findings.map(f => f.category);
    const hasAnnexIV = sys.documents.some(d => d.docType === 'ANNEX_IV');
    const hasFRIA = sys.documents.some(d => d.docType === 'FRIA');

    const mappings: RegulationMapping[] = Object.entries(CROSS_MAP).map(([aiActRef, cross]) => {
      const cat = aiActRef.replace(/Art\. \d+ /, '').replace(/ /g, '_').toUpperCase();
      const hasFinding = findingCats.includes(cat as any);
      let status: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' = 'COMPLIANT';
      if (sys.riskLevel === 'MINIMAL' && !['Art. 50 Transparency'].includes(aiActRef)) status = 'NOT_APPLICABLE';
      else if (hasFinding) status = sys.findings.some(f => f.category === cat && f.severity === 'CRITICAL') ? 'NON_COMPLIANT' : 'PARTIAL';
      else if (aiActRef.includes('Documentation') && !hasAnnexIV) status = 'NON_COMPLIANT';
      else if (aiActRef.includes('FRIA') && !hasFRIA) status = 'NON_COMPLIANT';

      return {
        regulation: 'EU AI Act', requirement: aiActRef, articleRef: aiActRef.split(' ').slice(0, 2).join(' '),
        status, agentOpsMapping: `AgentOps covers this via ${cat} assessment`,
        overlap: [cross.gdpr, cross.iso42001, cross.nist].filter(Boolean),
      };
    });

    const compliantCount = mappings.filter(m => m.status === 'COMPLIANT').length;
    const totalApplicable = mappings.filter(m => m.status !== 'NOT_APPLICABLE').length;

    return {
      systemId, systemName: sys.name, riskLevel: sys.riskLevel,
      regulations: REGULATIONS,
      crossComplianceScore: totalApplicable > 0 ? Math.round((compliantCount / totalApplicable) * 100) : 100,
      mappings,
      summary: {
        euAiAct: { compliant: compliantCount, total: totalApplicable },
        gdprOverlap: mappings.filter(m => m.overlap.some(o => o.includes('Art.'))).length,
        isoOverlap: mappings.filter(m => m.overlap.some(o => o.includes('ISO') || o.includes('.'))).length,
        nistOverlap: mappings.filter(m => m.overlap.some(o => o.includes('MAP') || o.includes('MEASURE') || o.includes('GOVERN'))).length,
      },
      insight: compliantCount === totalApplicable
        ? 'Full cross-regulation compliance achieved. Your EU AI Act compliance also satisfies key GDPR, ISO 42001, and NIST AI RMF requirements.'
        : `${totalApplicable - compliantCount} cross-regulation gaps remain. Fixing EU AI Act findings will simultaneously improve GDPR, ISO 42001, and NIST alignment.`,
    };
  }

  getRegulations() { return REGULATIONS; }
  getCrossMap() { return CROSS_MAP; }
}

@Controller('comparator')
export class ComparatorController {
  constructor(private s: ComparatorService) {}
  @Get('regulations') @ApiOperation({ summary: 'List supported regulations' }) regs() { return this.s.getRegulations(); }
  @Get('cross-map') @ApiOperation({ summary: 'Cross-regulation mapping (EU AI Act vs GDPR vs NIST vs ISO)' }) crossMap() { return this.s.getCrossMap(); }
  @Get('system/:id') @ApiOperation({ summary: 'Compare system against multiple regulations' }) compare(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') o: string) { return this.s.compareForSystem(o, id); }
}

@Module({ imports: [PrismaModule], controllers: [ComparatorController], providers: [ComparatorService], exports: [ComparatorService] })
export class ComparatorModule {}

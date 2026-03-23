import { ApiOperation } from '@nestjs/swagger';
import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

interface ChecklistItem { id: string; article: string; title: string; description: string; category: string; riskLevel: 'HIGH'|'LIMITED'|'ALL'; checked: boolean; checkedBy?: string; checkedAt?: string; evidence?: string; }

const MASTER_CHECKLIST: Omit<ChecklistItem, 'checked'>[] = [
  { id: 'c01', article: 'Art. 5', title: 'No prohibited AI practices', description: 'Verify system does not perform social scoring, subliminal manipulation, exploitation of vulnerable groups, or banned biometric identification.', category: 'PROHIBITED', riskLevel: 'ALL' },
  { id: 'c02', article: 'Art. 6', title: 'Risk level classified', description: 'AI system has been classified according to Annex III risk categories.', category: 'CLASSIFICATION', riskLevel: 'ALL' },
  { id: 'c03', article: 'Art. 9(1)', title: 'Risk management system established', description: 'Continuous iterative risk management process is in place covering identification, analysis, estimation, evaluation, and elimination/mitigation of risks.', category: 'RISK_MANAGEMENT', riskLevel: 'HIGH' },
  { id: 'c04', article: 'Art. 9(2)', title: 'Risk management testing', description: 'Appropriate testing procedures are defined and performed, including pre-market and in-operation testing.', category: 'RISK_MANAGEMENT', riskLevel: 'HIGH' },
  { id: 'c05', article: 'Art. 9(4)', title: 'Residual risk mitigation', description: 'Residual risks are communicated to users and mitigated through instructions of use and human oversight measures.', category: 'RISK_MANAGEMENT', riskLevel: 'HIGH' },
  { id: 'c06', article: 'Art. 10(2)', title: 'Training data governance', description: 'Training, validation, and testing datasets meet quality criteria: relevance, representativeness, free of errors, completeness.', category: 'DATA_GOVERNANCE', riskLevel: 'HIGH' },
  { id: 'c07', article: 'Art. 10(2)(f)', title: 'Bias examination', description: 'Datasets have been examined for possible biases that may affect health, safety, or fundamental rights.', category: 'DATA_GOVERNANCE', riskLevel: 'HIGH' },
  { id: 'c08', article: 'Art. 10(5)', title: 'Special categories data', description: 'If processing special categories (biometric, health), appropriate safeguards and legal basis are documented.', category: 'DATA_GOVERNANCE', riskLevel: 'HIGH' },
  { id: 'c09', article: 'Art. 11', title: 'Technical documentation (Annex IV)', description: 'Comprehensive technical documentation has been created following Annex IV structure (9 sections).', category: 'DOCUMENTATION', riskLevel: 'HIGH' },
  { id: 'c10', article: 'Art. 12(1)', title: 'Automatic logging enabled', description: 'System automatically records events for traceability throughout its lifecycle. Logs include timestamps, inputs, outputs, and reference data.', category: 'LOGGING', riskLevel: 'HIGH' },
  { id: 'c11', article: 'Art. 12(2)', title: 'Log retention (6 months)', description: 'Logging capabilities allow storage of logs for at least 6 months, unless otherwise required by law.', category: 'LOGGING', riskLevel: 'HIGH' },
  { id: 'c12', article: 'Art. 13(1)', title: 'Transparency: instructions of use', description: 'Clear instructions of use accompany the system, including: intended purpose, accuracy levels, known limitations, and human oversight measures.', category: 'TRANSPARENCY', riskLevel: 'HIGH' },
  { id: 'c13', article: 'Art. 14(1)', title: 'Human oversight design', description: 'System is designed to allow effective human oversight during its period of use, including ability to understand capabilities, detect anomalies, and override.', category: 'HUMAN_OVERSIGHT', riskLevel: 'HIGH' },
  { id: 'c14', article: 'Art. 14(4)', title: 'Override/stop capability', description: 'Human operators can override or stop the system at any time.', category: 'HUMAN_OVERSIGHT', riskLevel: 'HIGH' },
  { id: 'c15', article: 'Art. 15(1)', title: 'Accuracy levels defined', description: 'Appropriate levels of accuracy are achieved and documented. Accuracy metrics are declared in instructions of use.', category: 'ACCURACY', riskLevel: 'HIGH' },
  { id: 'c16', article: 'Art. 15(4)', title: 'Cybersecurity measures', description: 'System is resilient against unauthorized access and adversarial attacks. Technical redundancy and fail-safe measures are in place.', category: 'ACCURACY', riskLevel: 'HIGH' },
  { id: 'c17', article: 'Art. 16(a)', title: 'Quality management system', description: 'Provider has implemented a quality management system covering all Art. 8-15 requirements.', category: 'PROVIDER', riskLevel: 'HIGH' },
  { id: 'c18', article: 'Art. 27', title: 'Fundamental rights impact assessment', description: 'FRIA has been conducted before deploying the high-risk AI system.', category: 'FRIA', riskLevel: 'HIGH' },
  { id: 'c19', article: 'Art. 43', title: 'Conformity assessment completed', description: 'Internal conformity assessment (Annex VI) or third-party assessment (Annex VII) has been completed.', category: 'CONFORMITY', riskLevel: 'HIGH' },
  { id: 'c20', article: 'Art. 49', title: 'CE marking affixed', description: 'CE marking has been affixed visibly, legibly, and indelibly to the AI system or its documentation.', category: 'CONFORMITY', riskLevel: 'HIGH' },
  { id: 'c21', article: 'Art. 50(1)', title: 'AI interaction disclosure', description: 'Users are informed they are interacting with an AI system, unless obvious from context.', category: 'TRANSPARENCY', riskLevel: 'LIMITED' },
  { id: 'c22', article: 'Art. 50(4)', title: 'Deep fake labeling', description: 'AI-generated or manipulated content (deep fakes) is clearly labelled as artificially generated.', category: 'TRANSPARENCY', riskLevel: 'LIMITED' },
  { id: 'c23', article: 'Art. 71', title: 'EU database registration', description: 'System is registered in the EU database before being placed on the market.', category: 'REGISTRATION', riskLevel: 'HIGH' },
  { id: 'c24', article: 'Art. 72', title: 'Post-market monitoring plan', description: 'Post-market monitoring system is established and documented as part of the quality management system.', category: 'MONITORING', riskLevel: 'HIGH' },
  { id: 'c25', article: 'Art. 73', title: 'Incident reporting procedure', description: 'Procedure for reporting serious incidents within 72 hours (initial) and 15 days (detailed) is established.', category: 'MONITORING', riskLevel: 'HIGH' },
];

@Injectable()
export class ChecklistService {
  constructor(private prisma: PrismaService) {}

  async getForSystem(orgId: string, systemId: string): Promise<{ systemName: string; riskLevel: string | null; checklist: ChecklistItem[]; progress: { total: number; checked: number; percent: number } }> {
    const sys = await this.prisma.aiSystem.findFirst({ where: { id: systemId, organizationId: orgId, deletedAt: null } });
    if (!sys) return { systemName: 'Unknown', riskLevel: null, checklist: [], progress: { total: 0, checked: 0, percent: 0 } };

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const saved = ((org?.settings as any)?.checklists?.[systemId] || {}) as Record<string, { checked: boolean; checkedBy?: string; checkedAt?: string; evidence?: string }>;

    const applicable = MASTER_CHECKLIST.filter(item => {
      if (item.riskLevel === 'ALL') return true;
      if (item.riskLevel === 'HIGH' && sys.riskLevel === 'HIGH') return true;
      if (item.riskLevel === 'LIMITED' && (sys.riskLevel === 'LIMITED' || sys.riskLevel === 'HIGH')) return true;
      return false;
    });

    const checklist: ChecklistItem[] = applicable.map(item => ({
      ...item, riskLevel: item.riskLevel,
      checked: saved[item.id]?.checked || false,
      checkedBy: saved[item.id]?.checkedBy,
      checkedAt: saved[item.id]?.checkedAt,
      evidence: saved[item.id]?.evidence,
    }));

    const checked = checklist.filter(c => c.checked).length;
    return { systemName: sys.name, riskLevel: sys.riskLevel, checklist, progress: { total: checklist.length, checked, percent: checklist.length > 0 ? Math.round((checked / checklist.length) * 100) : 0 } };
  }

  async toggleItem(orgId: string, systemId: string, itemId: string, userId: string, evidence?: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const s = (org?.settings as any) || {};
    if (!s.checklists) s.checklists = {};
    if (!s.checklists[systemId]) s.checklists[systemId] = {};

    const current = s.checklists[systemId][itemId];
    s.checklists[systemId][itemId] = {
      checked: !current?.checked,
      checkedBy: !current?.checked ? userId : undefined,
      checkedAt: !current?.checked ? new Date().toISOString() : undefined,
      evidence: evidence || current?.evidence,
    };
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: s } });
    return s.checklists[systemId][itemId];
  }

  getMasterChecklist() { return MASTER_CHECKLIST; }
}

@Controller('checklist')
export class ChecklistController {
  constructor(private s: ChecklistService) {}
  @Get('master') @ApiOperation({ summary: 'Get master checklist (25 items)' }) master() { return this.s.getMasterChecklist(); }
  @Get('system/:id') @ApiOperation({ summary: 'Get items checklist' }) get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') o: string) { return this.s.getForSystem(o, id); }
  @Patch('system/:sysId/item/:itemId') @ApiOperation({ summary: 'Toggle item status' }) toggle(@Param('sysId') sId: string, @Param('itemId') iId: string, @CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Body('evidence') ev?: string) { return this.s.toggleItem(o, sId, iId, u, ev); }
}

@Module({ imports: [PrismaModule], controllers: [ChecklistController], providers: [ChecklistService], exports: [ChecklistService] })
export class ChecklistModule {}

import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

interface RoadmapStep { id: string; phase: number; title: string; description: string; articleRef: string; dueDate: string; priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; estimatedDays: number; status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED'; dependencies: string[]; }

@Injectable()
export class RoadmapService {
  constructor(private prisma: PrismaService) {}

  async generateForSystem(orgId: string, systemId: string) {
    const system = await this.prisma.aiSystem.findFirst({
      where: { id: systemId, organizationId: orgId, deletedAt: null },
      include: { findings: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }, assessments: { where: { status: 'COMPLETED' }, take: 1, orderBy: { completedAt: 'desc' } }, documents: true },
    });
    if (!system) return null;

    const deadline = new Date('2026-08-02T00:00:00Z');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    const risk = system.riskLevel;
    const hasAssessment = system.assessments.length > 0;
    const hasAnnexIV = system.documents.some(d => d.docType === 'ANNEX_IV');
    const hasFRIA = system.documents.some(d => d.docType === 'FRIA');
    const criticalFindings = system.findings.filter(f => f.severity === 'CRITICAL').length;
    const steps: RoadmapStep[] = [];
    let phase = 1;

    // Phase 1: Classification (if not done)
    if (!risk) {
      steps.push({ id: 'classify', phase: 1, title: 'Classify AI System Risk Level', description: 'Run the Classification Agent to determine risk level under Art. 5-6 and Annex III. This determines all subsequent obligations.', articleRef: 'Art. 6', dueDate: this.addDays(14), priority: 'CRITICAL', estimatedDays: 1, status: 'NOT_STARTED', dependencies: [] });
      phase = 2;
    }

    // Phase 2: Assessment (if classified but not assessed)
    if (risk && !hasAssessment) {
      steps.push({ id: 'assess', phase, title: 'Run Full Compliance Assessment', description: 'Execute Classification + Technical Audit + Bias Detection pipeline to identify all compliance gaps.', articleRef: 'Art. 9-15', dueDate: this.addDays(21), priority: 'CRITICAL', estimatedDays: 1, status: 'NOT_STARTED', dependencies: risk ? [] : ['classify'] });
      phase++;
    }

    // Phase 3: HIGH risk specific obligations
    if (risk === 'HIGH' || risk === 'LIMITED') {
      if (criticalFindings > 0) {
        steps.push({ id: 'fix-critical', phase, title: `Resolve ${criticalFindings} Critical Finding(s)`, description: 'Address all CRITICAL severity findings before proceeding. These represent potential regulatory violations.', articleRef: 'Art. 8', dueDate: this.addDays(30), priority: 'CRITICAL', estimatedDays: 14, status: 'NOT_STARTED', dependencies: hasAssessment ? [] : ['assess'] });
      }

      if (risk === 'HIGH') {
        // Risk Management System (Art. 9)
        steps.push({ id: 'rms', phase: phase + 1, title: 'Implement Risk Management System', description: 'Establish continuous iterative risk management process: identify risks, estimate severity, adopt measures, test effectiveness, document everything.', articleRef: 'Art. 9', dueDate: this.addDays(60), priority: 'HIGH', estimatedDays: 21, status: system.findings.some(f => f.category === 'RISK_MANAGEMENT' && f.status !== 'OPEN') ? 'IN_PROGRESS' : 'NOT_STARTED', dependencies: [] });

        // Data Governance (Art. 10)
        steps.push({ id: 'data-gov', phase: phase + 1, title: 'Data Governance Framework', description: 'Document training data choices, preprocessing, labeling. Ensure data is relevant, representative, free of errors, and complete. Check for biases.', articleRef: 'Art. 10', dueDate: this.addDays(60), priority: 'HIGH', estimatedDays: 14, status: 'NOT_STARTED', dependencies: [] });

        // Technical Documentation (Art. 11 + Annex IV)
        if (!hasAnnexIV) {
          steps.push({ id: 'annex-iv', phase: phase + 2, title: 'Generate Annex IV Technical Documentation', description: 'Comprehensive technical documentation covering all 9 sections required by Annex IV. Use the Documentation Generator to create a first draft.', articleRef: 'Art. 11, Annex IV', dueDate: this.addDays(75), priority: 'HIGH', estimatedDays: 7, status: 'NOT_STARTED', dependencies: ['rms', 'data-gov'] });
        }

        // Logging (Art. 12)
        steps.push({ id: 'logging', phase: phase + 2, title: 'Implement Automatic Logging', description: 'Enable logging of AI system operation events: inputs, outputs, decisions, timestamps. Logs must be kept for at least 6 months.', articleRef: 'Art. 12', dueDate: this.addDays(75), priority: 'HIGH', estimatedDays: 7, status: 'NOT_STARTED', dependencies: [] });

        // Transparency (Art. 13)
        steps.push({ id: 'transparency', phase: phase + 2, title: 'Transparency & User Instructions', description: 'Provide clear instructions of use to deployers including: intended purpose, level of accuracy, known limitations, human oversight measures, and maintenance requirements.', articleRef: 'Art. 13', dueDate: this.addDays(90), priority: 'MEDIUM', estimatedDays: 7, status: 'NOT_STARTED', dependencies: ['annex-iv'] });

        // Human Oversight (Art. 14)
        steps.push({ id: 'oversight', phase: phase + 3, title: 'Human Oversight Mechanisms', description: 'Design and implement mechanisms for human oversight: ability to understand system capabilities, detect anomalies, interpret outputs, decide to override, and ability to stop the system.', articleRef: 'Art. 14', dueDate: this.addDays(90), priority: 'HIGH', estimatedDays: 14, status: 'NOT_STARTED', dependencies: [] });

        // Accuracy & Robustness (Art. 15)
        steps.push({ id: 'accuracy', phase: phase + 3, title: 'Accuracy, Robustness & Cybersecurity', description: 'Ensure appropriate level of accuracy. Implement resilience against errors, faults, inconsistencies. Apply cybersecurity measures against adversarial attacks.', articleRef: 'Art. 15', dueDate: this.addDays(105), priority: 'MEDIUM', estimatedDays: 14, status: 'NOT_STARTED', dependencies: [] });

        // FRIA (Art. 27)
        if (!hasFRIA) {
          steps.push({ id: 'fria', phase: phase + 3, title: 'Fundamental Rights Impact Assessment', description: 'Conduct FRIA before deploying high-risk AI system. Assess impact on equality, non-discrimination, privacy, freedom of expression, and other fundamental rights.', articleRef: 'Art. 27', dueDate: this.addDays(105), priority: 'HIGH', estimatedDays: 7, status: 'NOT_STARTED', dependencies: ['rms'] });
        }

        // Conformity Assessment (Art. 43)
        steps.push({ id: 'conformity', phase: phase + 4, title: 'Conformity Assessment', description: 'Complete internal conformity assessment (Annex VI) or third-party assessment (Annex VII for biometric systems). Verify all Art. 8-15 requirements are met.', articleRef: 'Art. 43', dueDate: this.addDays(120), priority: 'CRITICAL', estimatedDays: 7, status: 'NOT_STARTED', dependencies: ['rms', 'data-gov', 'annex-iv', 'logging', 'oversight', 'accuracy'] });

        // EU Database Registration (Art. 71)
        steps.push({ id: 'eu-db', phase: phase + 4, title: 'Register in EU Database', description: 'Register the AI system in the EU database before placing on market. Include: system ID, provider details, intended purpose, risk level, conformity assessment reference.', articleRef: 'Art. 71', dueDate: this.addDays(130), priority: 'CRITICAL', estimatedDays: 1, status: 'NOT_STARTED', dependencies: ['conformity'] });

        // Post-Market Monitoring (Art. 72)
        steps.push({ id: 'monitoring', phase: phase + 5, title: 'Post-Market Monitoring Plan', description: 'Establish post-market monitoring system proportionate to risks. Include incident detection, drift monitoring, feedback collection, and reporting mechanisms.', articleRef: 'Art. 72', dueDate: this.addDays(140), priority: 'HIGH', estimatedDays: 7, status: 'NOT_STARTED', dependencies: ['conformity'] });

        // Incident Reporting Setup (Art. 73)
        steps.push({ id: 'incidents', phase: phase + 5, title: 'Incident Reporting Procedure', description: 'Establish procedure for reporting serious incidents within 72 hours (initial) and 15 days (detailed). Define what constitutes a serious incident for your system.', articleRef: 'Art. 73', dueDate: this.addDays(140), priority: 'MEDIUM', estimatedDays: 3, status: 'NOT_STARTED', dependencies: ['monitoring'] });
      }
    }

    // Phase: LIMITED risk obligations
    if (risk === 'LIMITED') {
      steps.push({ id: 'art50', phase: phase + 1, title: 'Implement Art. 50 Transparency', description: 'Ensure users are informed they are interacting with AI. Label AI-generated content. Implement disclosure mechanisms.', articleRef: 'Art. 50', dueDate: this.addDays(45), priority: 'HIGH', estimatedDays: 3, status: 'NOT_STARTED', dependencies: [] });
    }

    // Calculate overall readiness
    const completed = steps.filter(s => s.status === 'COMPLETED').length;
    const total = steps.length;
    const readinessPercent = total > 0 ? Math.round((completed / total) * 100) : (risk === 'MINIMAL' ? 100 : 0);

    return {
      systemId, systemName: system.name, riskLevel: risk, complianceStatus: system.complianceStatus,
      deadline: { date: '2026-08-02', daysLeft, urgency: daysLeft < 60 ? 'CRITICAL' : daysLeft < 120 ? 'HIGH' : daysLeft < 180 ? 'MEDIUM' : 'LOW' },
      readiness: { percent: readinessPercent, completed, total, estimatedDaysToComplete: steps.filter(s => s.status !== 'COMPLETED').reduce((sum, s) => sum + s.estimatedDays, 0) },
      steps,
      phases: this.groupByPhase(steps),
    };
  }

  async generateForOrg(orgId: string) {
    const systems = await this.prisma.aiSystem.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, riskLevel: true } });
    const roadmaps = await Promise.all(systems.map(s => this.generateForSystem(orgId, s.id)));
    const totalSteps = roadmaps.reduce((s, r) => s + (r?.readiness?.total || 0), 0);
    const completedSteps = roadmaps.reduce((s, r) => s + (r?.readiness?.completed || 0), 0);
    return {
      organizationReadiness: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      totalSystems: systems.length,
      highRiskSystems: systems.filter(s => s.riskLevel === 'HIGH').length,
      systems: roadmaps.filter(Boolean),
    };
  }

  private addDays(days: number): string {
    const d = new Date(); d.setDate(d.getDate() + days);
    const deadline = new Date('2026-08-02T00:00:00Z');
    return (d > deadline ? deadline : d).toISOString().split('T')[0];
  }

  private groupByPhase(steps: RoadmapStep[]) {
    const phases: Record<number, RoadmapStep[]> = {};
    steps.forEach(s => { if (!phases[s.phase]) phases[s.phase] = []; phases[s.phase].push(s); });
    return Object.entries(phases).map(([p, s]) => ({ phase: +p, steps: s }));
  }
}

@Controller('roadmap')
export class RoadmapController {
  constructor(private s: RoadmapService) {}
  @Get('organization') @ApiOperation({ summary: 'Organization compliance roadmap' }) orgRoadmap(@CurrentUser('organizationId') o: string) { return this.s.generateForOrg(o); }
  @Get('system/:id') @ApiOperation({ summary: 'Get compliance roadmap for system' }) systemRoadmap(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') o: string) { return this.s.generateForSystem(o, id); }
}

@Module({ imports: [PrismaModule], controllers: [RoadmapController], providers: [RoadmapService], exports: [RoadmapService] })
export class RoadmapModule {}

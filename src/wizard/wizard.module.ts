import { BadRequestException, Body, Controller, Injectable, Logger, Module, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';
import { AgentsModule, ClassificationAgentService } from '../agents/agents.module';

interface WizardStep { step: number; title: string; status: 'PENDING' | 'COMPLETED' | 'SKIPPED'; result?: any; estimatedMinutes: number; }

class WizardStartDto {
  @IsString() systemName: string;
  @IsString() description: string;
  @IsString() purpose: string;
  @IsString() sector: string;
  @IsArray() @IsOptional() dataTypes?: string[];
  @IsString() @IsOptional() deploymentContext?: string;
  @IsString() @IsOptional() affectedPopulation?: string;
  @IsString() @IsOptional() repoUrl?: string;
}

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);
  constructor(private prisma: PrismaService, private classifier: ClassificationAgentService) {}

  async start(orgId: string, userId: string, dto: WizardStartDto) {
    const startTime = Date.now();
    this.logger.log(`Wizard started for ${dto.systemName} by ${userId}`);

    const steps: WizardStep[] = [
      { step: 1, title: 'Register AI System', status: 'PENDING', estimatedMinutes: 2 },
      { step: 2, title: 'Risk Classification (AI-powered)', status: 'PENDING', estimatedMinutes: 1 },
      { step: 3, title: 'Obligation Mapping', status: 'PENDING', estimatedMinutes: 1 },
      { step: 4, title: 'Quick Compliance Checklist', status: 'PENDING', estimatedMinutes: 5 },
      { step: 5, title: 'Document Readiness Assessment', status: 'PENDING', estimatedMinutes: 2 },
      { step: 6, title: 'Compliance Score & Roadmap', status: 'PENDING', estimatedMinutes: 1 },
    ];

    // Step 1: Register system
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const systemCount = await this.prisma.aiSystem.count({ where: { organizationId: orgId, deletedAt: null } });
    const planLimits: Record<string, number> = { FREE: 1, STARTER: 3, PROFESSIONAL: 15, ENTERPRISE: 999 };
    const limit = planLimits[org?.plan || 'FREE'] || 1;
    if (systemCount >= limit) throw new BadRequestException(`Plan limit reached (${limit} systems). Upgrade to add more.`);

    const system = await this.prisma.aiSystem.create({
      data: { name: dto.systemName, description: dto.description, purpose: dto.purpose, sector: dto.sector, dataTypes: dto.dataTypes || [], deploymentContext: dto.deploymentContext, affectedPopulation: dto.affectedPopulation, repoUrl: dto.repoUrl, organizationId: orgId },
    });
    steps[0].status = 'COMPLETED';
    steps[0].result = { systemId: system.id, name: system.name };

    // Step 2: Classify risk
    const classification = await this.classifier.classify({
      systemDescription: dto.description, purpose: dto.purpose, sector: dto.sector,
      dataTypes: dto.dataTypes || [], deploymentContext: dto.deploymentContext || '', affectedPopulation: dto.affectedPopulation || '',
    });
    await this.prisma.aiSystem.update({ where: { id: system.id }, data: { riskLevel: classification.riskLevel as any } });
    steps[1].status = 'COMPLETED';
    steps[1].result = { riskLevel: classification.riskLevel, confidence: classification.confidence, reasoning: classification.reasoning };

    // Step 3: Map obligations based on risk level
    const obligations = this.getObligations(classification.riskLevel);
    steps[2].status = 'COMPLETED';
    steps[2].result = obligations;

    // Step 4: Quick checklist
    const checklist = this.getQuickChecklist(classification.riskLevel);
    steps[3].status = 'COMPLETED';
    steps[3].result = checklist;

    // Step 5: Document readiness
    const docReadiness = this.getDocReadiness(classification.riskLevel);
    steps[4].status = 'COMPLETED';
    steps[4].result = docReadiness;

    // Step 6: Score and roadmap
    const score = this.calculateInitialScore(classification.riskLevel);
    const nextSteps = this.getNextSteps(classification.riskLevel, system.id);
    steps[5].status = 'COMPLETED';
    steps[5].result = { score, nextSteps };

    const durationMs = Date.now() - startTime;
    const deadline = new Date('2026-08-02');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

    return {
      wizardComplete: true,
      systemId: system.id,
      systemName: system.name,
      riskLevel: classification.riskLevel,
      confidence: classification.confidence,
      initialScore: score,
      steps,
      summary: {
        riskLevel: classification.riskLevel,
        totalObligations: obligations.total,
        criticalActions: obligations.critical,
        documentsNeeded: docReadiness.documentsNeeded,
        estimatedDaysToComply: classification.riskLevel === 'HIGH' ? 60 : classification.riskLevel === 'LIMITED' ? 20 : 5,
        daysUntilDeadline: daysLeft,
        complianceGap: classification.riskLevel === 'HIGH' ? 'SIGNIFICANT' : classification.riskLevel === 'LIMITED' ? 'MODERATE' : 'MINIMAL',
      },
      nextSteps,
      durationMs,
      message: classification.riskLevel === 'UNACCEPTABLE'
        ? `ALERT: This system is classified as UNACCEPTABLE (prohibited). It CANNOT be deployed in the EU. Immediate action required.`
        : classification.riskLevel === 'HIGH'
        ? `Your system is HIGH risk with ${obligations.total} obligations. You have ${daysLeft} days until enforcement. Start with the roadmap.`
        : classification.riskLevel === 'LIMITED'
        ? `Your system is LIMITED risk. Focus on Art. 50 transparency obligations. ${daysLeft} days remaining.`
        : `Your system is MINIMAL risk with no mandatory obligations. Consider voluntary compliance for competitive advantage.`,
    };
  }

  private getObligations(riskLevel: string) {
    const all: Record<string, { total: number; critical: number; articles: string[]; categories: string[] }> = {
      UNACCEPTABLE: { total: 1, critical: 1, articles: ['Art. 5'], categories: ['Cease operation immediately'] },
      HIGH: { total: 25, critical: 8, articles: ['Art. 8-15', 'Art. 16-22', 'Art. 27', 'Art. 43', 'Art. 49', 'Art. 71-73'], categories: ['Risk Management (Art. 9)', 'Data Governance (Art. 10)', 'Documentation (Art. 11)', 'Logging (Art. 12)', 'Transparency (Art. 13)', 'Human Oversight (Art. 14)', 'Accuracy (Art. 15)', 'Conformity Assessment (Art. 43)', 'CE Marking (Art. 49)', 'EU Database Registration (Art. 71)', 'Post-Market Monitoring (Art. 72)', 'Incident Reporting (Art. 73)'] },
      LIMITED: { total: 4, critical: 2, articles: ['Art. 50'], categories: ['AI Interaction Disclosure', 'Content Labelling', 'Emotion Recognition Disclosure', 'Deep Fake Labelling'] },
      MINIMAL: { total: 0, critical: 0, articles: [], categories: ['No mandatory obligations (voluntary codes of conduct encouraged)'] },
    };
    return all[riskLevel] || all.MINIMAL;
  }

  private getQuickChecklist(riskLevel: string): { items: { question: string; critical: boolean }[]; answeredYes: number } {
    const items = riskLevel === 'HIGH' ? [
      { question: 'Do you have a documented risk management system?', critical: true },
      { question: 'Is your training data documented and bias-examined?', critical: true },
      { question: 'Do you have Annex IV technical documentation?', critical: true },
      { question: 'Does your system have automatic logging enabled?', critical: false },
      { question: 'Are users informed about AI interaction?', critical: true },
      { question: 'Can humans override or stop the system?', critical: true },
      { question: 'Have you defined accuracy metrics?', critical: false },
      { question: 'Do you have a post-market monitoring plan?', critical: false },
      { question: 'Have you conducted a FRIA?', critical: true },
      { question: 'Is the system registered in the EU database?', critical: true },
    ] : riskLevel === 'LIMITED' ? [
      { question: 'Do users know they are interacting with AI?', critical: true },
      { question: 'Is AI-generated content labelled?', critical: true },
      { question: 'Are deep fakes clearly marked?', critical: false },
    ] : [{ question: 'No mandatory checklist items for MINIMAL risk.', critical: false }];
    return { items, answeredYes: 0 };
  }

  private getDocReadiness(riskLevel: string) {
    const docs = riskLevel === 'HIGH' ? [
      { doc: 'Annex IV Technical Documentation', status: 'NOT_STARTED', priority: 'CRITICAL' },
      { doc: 'Fundamental Rights Impact Assessment (FRIA)', status: 'NOT_STARTED', priority: 'CRITICAL' },
      { doc: 'EU Declaration of Conformity', status: 'NOT_STARTED', priority: 'HIGH' },
      { doc: 'Post-Market Monitoring Plan', status: 'NOT_STARTED', priority: 'HIGH' },
      { doc: 'Risk Management System Documentation', status: 'NOT_STARTED', priority: 'CRITICAL' },
      { doc: 'Instructions of Use', status: 'NOT_STARTED', priority: 'MEDIUM' },
      { doc: 'Data Governance Policy', status: 'NOT_STARTED', priority: 'HIGH' },
    ] : riskLevel === 'LIMITED' ? [
      { doc: 'Transparency Notice (Art. 50)', status: 'NOT_STARTED', priority: 'CRITICAL' },
      { doc: 'AI Interaction Disclosure', status: 'NOT_STARTED', priority: 'HIGH' },
    ] : [];
    return { documents: docs, documentsNeeded: docs.length, criticalDocs: docs.filter(d => d.priority === 'CRITICAL').length };
  }

  private calculateInitialScore(riskLevel: string): { score: number; grade: string; meaning: string } {
    // New system with no compliance work done yet
    if (riskLevel === 'UNACCEPTABLE') return { score: 0, grade: 'F', meaning: 'System is prohibited. Cannot achieve compliance.' };
    if (riskLevel === 'HIGH') return { score: 10, grade: 'F', meaning: 'Classification done. 24 more obligations to fulfill.' };
    if (riskLevel === 'LIMITED') return { score: 30, grade: 'D', meaning: 'Classification done. Transparency obligations pending.' };
    return { score: 90, grade: 'A', meaning: 'Minimal risk. No mandatory obligations. Classification is your main action.' };
  }

  private getNextSteps(riskLevel: string, systemId: string) {
    if (riskLevel === 'UNACCEPTABLE') return [{ action: 'CEASE OPERATION', description: 'This AI system falls under prohibited practices (Art. 5). It cannot be deployed in the EU.', urgency: 'IMMEDIATE', endpoint: null }];
    if (riskLevel === 'HIGH') return [
      { action: 'Run Full Assessment', description: 'Execute the 5-agent pipeline: classification, technical audit, bias detection', urgency: 'THIS_WEEK', endpoint: `POST /api/v1/ai-systems/${systemId}/assessments` },
      { action: 'Generate Annex IV', description: 'Auto-generate the 9-section technical documentation', urgency: 'THIS_WEEK', endpoint: `POST /api/v1/documents/generate/annex-iv/${systemId}` },
      { action: 'Generate FRIA', description: 'Fundamental Rights Impact Assessment', urgency: 'THIS_MONTH', endpoint: `POST /api/v1/documents/generate/fria/${systemId}` },
      { action: 'View Roadmap', description: 'See your personalized compliance roadmap with deadlines', urgency: 'TODAY', endpoint: `GET /api/v1/roadmap/system/${systemId}` },
      { action: 'Complete Checklist', description: 'Work through the 25-item compliance checklist', urgency: 'THIS_MONTH', endpoint: `GET /api/v1/checklist/system/${systemId}` },
    ];
    if (riskLevel === 'LIMITED') return [
      { action: 'Generate Transparency Notice', description: 'Auto-generate Art. 50 transparency notice', urgency: 'THIS_WEEK', endpoint: `POST /api/v1/documents/generate/transparency/${systemId}` },
      { action: 'Implement AI Disclosure', description: 'Add disclosure that users are interacting with AI', urgency: 'THIS_WEEK', endpoint: null },
    ];
    return [{ action: 'Monitor Changes', description: 'Your system is minimal risk. Monitor for regulatory updates.', urgency: 'QUARTERLY', endpoint: null }];
  }
}

@ApiTags('Wizard') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('wizard')
export class WizardController {
  constructor(private s: WizardService) {}

  @Post('start') @ApiOperation({ summary: 'Start compliance wizard (registers system + classifies + maps obligations in ~60 seconds)' })
  start(@Body() dto: WizardStartDto, @CurrentUser('organizationId') o: string, @CurrentUser('id') u: string) { return this.s.start(o, u, dto); }
}

@Module({ imports: [PrismaModule, AgentsModule], controllers: [WizardController], providers: [WizardService], exports: [WizardService] })
export class WizardModule {}

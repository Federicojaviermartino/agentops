import { Controller, Get, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';
import { AgentsModule, ClassificationAgentService, TechnicalAuditAgentService } from '../agents/agents.module';
import { FindingsModule, FindingsService } from '../findings/findings.module';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);
  constructor(
    private prisma: PrismaService,
    private classificationAgent: ClassificationAgentService,
    private technicalAuditAgent: TechnicalAuditAgentService,
    private findingsService: FindingsService,
  ) {}
  async create(aiSystemId: string, orgId: string, triggeredBy: string) {
    const system = await this.prisma.aiSystem.findFirst({
      where: { id: aiSystemId, organizationId: orgId, deletedAt: null },
    });
    if (!system) throw new NotFoundException('AI System not found');
    const assessment = await this.prisma.assessment.create({
      data: { aiSystemId, organizationId: orgId, type: 'FULL', status: 'PENDING', triggerType: 'MANUAL', triggeredBy },
    });
    // Run pipeline async
    this.runPipeline(assessment.id, system).catch((e) =>
      this.logger.error(`Pipeline failed: ${e.message}`),
    );
    return assessment;
  }
  private async runPipeline(assessmentId: string, system: any) {
    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    try {
      // STEP 1: Classification
      this.logger.log(`[${assessmentId}] Step 1: Classification`);
      const startTime = Date.now();
      const classResult = await this.classificationAgent.classify({
        systemDescription: system.description,
        purpose: system.purpose || '',
        sector: system.sector || '',
        dataTypes: system.dataTypes || [],
        deploymentContext: system.deploymentContext || '',
        affectedPopulation: system.affectedPopulation || '',
      });
      await this.prisma.assessmentResult.create({
        data: {
          assessmentId, agentType: 'CLASSIFICATION', status: 'COMPLETED',
          score: classResult.confidence * 100,
          output: JSON.parse(JSON.stringify(classResult)),
          tokensUsed: classResult.tokensUsed || 0,
          durationMs: Date.now() - startTime,
          startedAt: new Date(startTime), completedAt: new Date(),
        },
      });
      // Stop if UNACCEPTABLE
      if (classResult.riskLevel === 'UNACCEPTABLE') {
        await this.prisma.assessment.update({
          where: { id: assessmentId },
          data: { status: 'COMPLETED', completedAt: new Date(), overallScore: 0 },
        });
        await this.prisma.aiSystem.update({
          where: { id: system.id },
          data: { riskLevel: 'UNACCEPTABLE', complianceStatus: 'NON_COMPLIANT', lastAssessmentAt: new Date() },
        });
        await this.findingsService.createFinding({
          aiSystemId: system.id, assessmentId, organizationId: system.organizationId,
          articleRef: 'Art. 5', severity: 'CRITICAL', category: 'PROHIBITED_USE',
          title: 'System classified as UNACCEPTABLE risk',
          description: `Prohibited under Article 5. ${classResult.reasoning}`,
          remediation: 'This system cannot be deployed in the EU market.',
        });
        return;
      }
      await this.prisma.aiSystem.update({
        where: { id: system.id },
        data: { riskLevel: classResult.riskLevel as any },
      });
      // STEP 2: Technical Audit (HIGH and LIMITED)
      let auditScore = 100;
      if (classResult.riskLevel === 'HIGH' || classResult.riskLevel === 'LIMITED') {
        this.logger.log(`[${assessmentId}] Step 2: Technical Audit`);
        const auditStart = Date.now();
        try {
          const auditResult = await this.technicalAuditAgent.audit({
            aiSystemId: system.id, systemDescription: system.description,
            purpose: system.purpose || '', riskLevel: classResult.riskLevel,
            sector: system.sector || '', dataTypes: system.dataTypes || [],
            repoUrl: system.repoUrl || undefined,
          });
          auditScore = auditResult.overallScore;
          await this.prisma.assessmentResult.create({
            data: {
              assessmentId, agentType: 'TECHNICAL_AUDIT', status: 'COMPLETED',
              score: auditResult.overallScore, output: JSON.parse(JSON.stringify(auditResult)),
              tokensUsed: auditResult.tokensUsed || 0, durationMs: auditResult.durationMs,
              startedAt: new Date(auditStart), completedAt: new Date(),
            },
          });
          // Create findings from audit
          for (const finding of auditResult.findings) {
            await this.findingsService.createFinding({
              aiSystemId: system.id, assessmentId, organizationId: system.organizationId,
              articleRef: finding.article, severity: finding.severity, category: this.mapCategory(finding.area),
              title: finding.title, description: finding.description, remediation: finding.remediation,
              estimatedEffort: finding.estimatedEffort,
            });
          }
        } catch (e) {
          this.logger.warn(`Technical audit failed: ${(e as Error).message}`);
          await this.prisma.assessmentResult.create({
            data: { assessmentId, agentType: 'TECHNICAL_AUDIT', status: 'FAILED', errorMessage: (e as Error).message, startedAt: new Date(auditStart), completedAt: new Date() },
          });
        }
      }
      // STEP 3: Generate compliance findings based on risk level
      this.logger.log(`[${assessmentId}] Step 2: Generating compliance requirements`);
      await this.generateComplianceFindings(system, assessmentId, classResult.riskLevel);
      // Calculate overall score
      const results = await this.prisma.assessmentResult.findMany({ where: { assessmentId } });
      const scored = results.filter((r) => r.status === 'COMPLETED' && r.score !== null);
      const overallScore = scored.length > 0
        ? Math.round(scored.reduce((s, r) => s + (r.score || 0), 0) / scored.length)
        : 0;
      const openFindings = await this.prisma.complianceFinding.count({
        where: { aiSystemId: system.id, status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: { in: ['CRITICAL', 'HIGH'] } },
      });
      let complianceStatus = 'COMPLIANT';
      if (openFindings > 0) complianceStatus = 'NON_COMPLIANT';
      else if (overallScore < 80) complianceStatus = 'PARTIAL';
      await this.prisma.assessment.update({
        where: { id: assessmentId },
        data: { status: 'COMPLETED', completedAt: new Date(), overallScore },
      });
      await this.prisma.aiSystem.update({
        where: { id: system.id },
        data: { complianceStatus: complianceStatus as any, lastAssessmentAt: new Date() },
      });
      this.logger.log(`[${assessmentId}] Complete: score=${overallScore}, compliance=${complianceStatus}`);
    } catch (error) {
      this.logger.error(`[${assessmentId}] Failed: ${error.message}`);
      await this.prisma.assessment.update({
        where: { id: assessmentId },
        data: { status: 'FAILED', completedAt: new Date() },
      });
    }
  }
  private async generateComplianceFindings(system: any, assessmentId: string, riskLevel: string) {
    const reqs = [
      { article: 'Art. 9', severity: 'HIGH', category: 'RISK_MANAGEMENT', title: 'Establish risk management system', desc: 'Article 9 requires a risk management system throughout the lifecycle.', rem: 'Document risk identification, analysis, evaluation, and treatment.', levels: ['HIGH'] },
      { article: 'Art. 10', severity: 'HIGH', category: 'DATA_GOVERNANCE', title: 'Implement data governance', desc: 'Article 10 requires data governance and bias examination.', rem: 'Document datasets, implement quality checks, examine for biases.', levels: ['HIGH'] },
      { article: 'Art. 11', severity: 'HIGH', category: 'DOCUMENTATION', title: 'Prepare Annex IV documentation', desc: 'Article 11 requires technical documentation per Annex IV.', rem: 'Generate Annex IV documentation using the Documentation Generator.', levels: ['HIGH'] },
      { article: 'Art. 12', severity: 'HIGH', category: 'LOGGING', title: 'Implement automatic logging', desc: 'Article 12 requires automatic recording of events.', rem: 'Implement structured logging capturing inputs, outputs, timestamps, versions.', levels: ['HIGH'] },
      { article: 'Art. 13', severity: 'MEDIUM', category: 'TRANSPARENCY', title: 'Ensure transparency', desc: 'Article 13 requires system to be interpretable by deployers.', rem: 'Provide documentation on capabilities, limitations, and output interpretation.', levels: ['HIGH', 'LIMITED'] },
      { article: 'Art. 14', severity: 'HIGH', category: 'HUMAN_OVERSIGHT', title: 'Design for human oversight', desc: 'Article 14 requires effective oversight by natural persons.', rem: 'Implement override mechanisms, anomaly flagging, intervention procedures.', levels: ['HIGH'] },
      { article: 'Art. 15', severity: 'HIGH', category: 'ACCURACY_ROBUSTNESS', title: 'Achieve accuracy and robustness', desc: 'Article 15 requires appropriate accuracy, robustness, and cybersecurity.', rem: 'Define accuracy metrics, implement adversarial testing, security measures.', levels: ['HIGH'] },
      { article: 'Art. 50', severity: 'MEDIUM', category: 'TRANSPARENCY', title: 'AI-generated content disclosure', desc: 'Article 50 requires informing persons of AI interaction.', rem: 'Add clear disclosure that users interact with AI. Label AI-generated content.', levels: ['HIGH', 'LIMITED'] },
    ];
    for (const req of reqs) {
      if (req.levels.includes(riskLevel)) {
        await this.findingsService.createFinding({
          aiSystemId: system.id, assessmentId, organizationId: system.organizationId,
          articleRef: req.article, severity: req.severity, category: req.category,
          title: req.title, description: req.desc, remediation: req.rem,
        });
      }
    }
  }
  async get(id: string, orgId: string) {
    const a = await this.prisma.assessment.findFirst({
      where: { id, organizationId: orgId },
      include: { results: { orderBy: { createdAt: 'asc' } }, aiSystem: { select: { id: true, name: true, riskLevel: true } } },
    });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }
  async list(aiSystemId: string, orgId: string) {
    return this.prisma.assessment.findMany({
      where: { aiSystemId, organizationId: orgId },
      include: { results: { select: { agentType: true, status: true, score: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  private mapCategory(area: string): string {
    const map: Record<string, string> = {
      'Risk Management': 'RISK_MANAGEMENT', 'Risk Management System': 'RISK_MANAGEMENT',
      'Data Governance': 'DATA_GOVERNANCE', 'Technical Documentation': 'DOCUMENTATION',
      'Record-Keeping': 'LOGGING', 'Record-Keeping & Logging': 'LOGGING',
      'Transparency': 'TRANSPARENCY', 'Human Oversight': 'HUMAN_OVERSIGHT',
      'Accuracy, Robustness & Cybersecurity': 'ACCURACY_ROBUSTNESS', 'Accuracy': 'ACCURACY_ROBUSTNESS',
    };
    return map[area] || 'OTHER';
  }
}
@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-systems/:systemId/assessments')
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}
  @Post() @Roles('OWNER', 'ADMIN', 'COMPLIANCE_OFFICER') @ApiOperation({ summary: 'Api operation' })
  @ApiOperation({ summary: 'Trigger assessment' })
  create(@Param('systemId', ParseUUIDPipe) sId: string, @CurrentUser('organizationId') orgId: string, @CurrentUser('id') userId: string) {
    return this.service.create(sId, orgId, userId);
  }
  @Get() @ApiOperation({ summary: 'List assessments' })
  list(@Param('systemId', ParseUUIDPipe) sId: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.list(sId, orgId);
  }
  @Get(':id') @ApiOperation({ summary: 'Get assessment with results' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string) {
    return this.service.get(id, orgId);
  }
}
@Module({
  imports: [PrismaModule, AgentsModule, FindingsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}

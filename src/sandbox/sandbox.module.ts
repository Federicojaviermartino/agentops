import { Controller, Get, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

// Art. 57-63: Regulatory sandboxes for AI systems
const SANDBOX_INFO = {
  legal: 'Art. 57 requires each EU Member State to establish at least one AI regulatory sandbox by 2 August 2026.',
  smeAccess: 'Art. 57(11): SMEs and startups shall have priority access to sandboxes. No administrative fees for SMEs (Art. 57(12)).',
  benefits: [
    'Test AI systems under regulatory supervision before market placement',
    'Documentation from sandbox participation can be used to demonstrate compliance',
    'Good-faith participants are protected from administrative fines (Art. 63)',
    'Priority access for SMEs and startups (Art. 57(11))',
    'No administrative fees for micro, small, and medium enterprises (Art. 57(12))',
    'Possibility to test in real-world conditions (Art. 59-60)',
  ],
  applicationRequirements: [
    'Description of the AI system and its intended purpose',
    'Risk classification and preliminary self-assessment',
    'Testing plan with objectives, methodology, and timeline',
    'Data governance measures for the sandbox period',
    'Human oversight arrangements during testing',
    'Exit strategy and plan for market placement after sandbox',
    'Organization details including SME status documentation',
  ],
};

const OPERATIONAL_SANDBOXES = [
  { country: 'Spain', code: 'ES', authority: 'AESIA', status: 'OPERATIONAL', website: 'https://www.aesia.gob.es', applicationOpen: true, notes: 'First EU country with operational sandbox. Accepting applications.' },
  { country: 'Italy', code: 'IT', authority: 'AgID', status: 'OPERATIONAL', website: 'https://www.agid.gov.it', applicationOpen: true, notes: 'Operational since Law 132/2025.' },
  { country: 'France', code: 'FR', authority: 'CNIL/DGE', status: 'PLANNED', website: 'https://www.cnil.fr', applicationOpen: false, notes: 'Expected H1 2026.' },
  { country: 'Germany', code: 'DE', authority: 'BNetzA', status: 'PLANNED', website: 'https://www.bundesnetzagentur.de', applicationOpen: false, notes: 'Coordination phase via BNetzA.' },
  { country: 'Netherlands', code: 'NL', authority: 'AP/RDI', status: 'PLANNED', website: null, applicationOpen: false, notes: 'Algorithm register already operational.' },
  { country: 'Estonia', code: 'EE', authority: 'TTJA', status: 'PLANNED', website: null, applicationOpen: false, notes: 'Digital-first approach expected.' },
];

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  constructor(private prisma: PrismaService) {}

  getInfo() { return { ...SANDBOX_INFO, sandboxes: OPERATIONAL_SANDBOXES, operational: OPERATIONAL_SANDBOXES.filter(s => s.status === 'OPERATIONAL').length, accepting: OPERATIONAL_SANDBOXES.filter(s => s.applicationOpen).length }; }

  async generateApplication(orgId: string, systemId: string, targetCountry: string) {
    const [org, system] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.aiSystem.findFirst({
        where: { id: systemId, organizationId: orgId, deletedAt: null },
        include: { assessments: { where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, take: 1, include: { results: true } }, findings: { where: { deletedAt: null } }, documents: { take: 5 } },
      }),
    ]);
    if (!org || !system) throw new Error('Organization or system not found');

    const sandbox = OPERATIONAL_SANDBOXES.find(s => s.code === targetCountry.toUpperCase());
    const completedAssessment = system.assessments[0];
    const score = completedAssessment ? (completedAssessment as any).overallScore : null;
    const findingCount = system.findings?.length || 0;
    const docCount = system.documents?.length || 0;

    const application = {
      generatedAt: new Date().toISOString(),
      targetSandbox: { country: sandbox?.country || targetCountry, authority: sandbox?.authority || 'National Authority', status: sandbox?.status || 'UNKNOWN' },

      section1_organization: {
        title: '1. Organization Information',
        name: org.name,
        plan: org.plan,
        smeStatus: this.determineSmeStatus(org),
        smeEligibility: 'Priority access under Art. 57(11). Fee exemption under Art. 57(12).',
      },

      section2_system: {
        title: '2. AI System Description',
        name: system.name,
        version: system.version,
        description: system.description,
        purpose: system.purpose,
        sector: system.sector,
        riskLevel: system.riskLevel,
        dataTypes: system.dataTypes,
        deploymentContext: (system as any).deploymentContext || 'Production',
        affectedPopulation: (system as any).affectedPopulation || 'Not specified',
      },

      section3_classification: {
        title: '3. Risk Classification & Self-Assessment',
        riskLevel: system.riskLevel,
        complianceStatus: system.complianceStatus,
        lastAssessmentScore: score,
        openFindings: findingCount,
        documentsGenerated: docCount,
        selfAssessmentSummary: `System classified as ${system.riskLevel} risk. ${score ? `Last audit score: ${score}/100.` : 'No audit completed yet.'} ${findingCount} open findings.`,
      },

      section4_testingPlan: {
        title: '4. Sandbox Testing Plan',
        objective: `Validate compliance of ${system.name} with EU AI Act requirements for ${system.riskLevel} risk systems.`,
        methodology: [
          'Phase 1 (Weeks 1-2): Baseline compliance assessment using AgentOps automated audit',
          'Phase 2 (Weeks 3-6): Address identified gaps, implement remediation from findings',
          'Phase 3 (Weeks 7-10): Re-audit, document generation (Annex IV, FRIA), bias testing',
          'Phase 4 (Weeks 11-12): Final compliance score, conformity self-assessment, exit report',
        ],
        duration: '12 weeks',
        milestones: [
          { week: 2, deliverable: 'Baseline audit report with compliance score' },
          { week: 6, deliverable: 'Remediation completion report' },
          { week: 10, deliverable: 'Technical documentation package (Annex IV + FRIA)' },
          { week: 12, deliverable: 'Final compliance report and exit assessment' },
        ],
      },

      section5_dataGovernance: {
        title: '5. Data Governance Measures',
        dataTypes: system.dataTypes,
        measures: [
          'Training data documentation and bias examination (Art. 10)',
          'Data minimization and purpose limitation (GDPR alignment)',
          'Special categories data handling procedures if applicable',
          'Data quality assurance and validation protocols',
          'Sandbox data isolation from production environment',
        ],
      },

      section6_humanOversight: {
        title: '6. Human Oversight Arrangements',
        measures: [
          'Designated human oversight officer with authority to override/stop system',
          'Real-time monitoring dashboard for system decisions',
          'Escalation procedures for anomaly detection',
          'Regular review cycles (weekly during sandbox period)',
          'Confirmation bias awareness training for oversight personnel',
        ],
      },

      section7_exitStrategy: {
        title: '7. Exit Strategy',
        plan: `Upon successful sandbox completion: (1) Finalize all Annex IV documentation, (2) Complete conformity self-assessment per Annex VI, (3) Register in EU database per Art. 71, (4) Affix CE marking per Art. 49, (5) Establish post-market monitoring per Art. 72.`,
        targetMarketPlacement: 'Within 30 days of sandbox exit',
        contingency: 'If compliance gaps remain: extend sandbox period or pivot system design.',
      },

      readiness: {
        overallReadiness: score && score > 50 ? 'READY' : 'NEEDS_WORK',
        recommendation: score && score > 50
          ? 'Your system has a solid compliance foundation. Sandbox application recommended.'
          : 'Consider running a full assessment first to strengthen your application.',
        agentOpsEvidence: { assessmentsDone: !!completedAssessment, documentsGenerated: docCount, findingsAddressed: findingCount === 0, complianceScore: score },
      },
    };

    return application;
  }

  private determineSmeStatus(org: any): string {
    // In a real implementation, this would check employee count and revenue
    const plan = org.plan || 'STARTER';
    if (plan === 'STARTER') return 'Micro/Small Enterprise (< 50 employees, < EUR 10M turnover) - Priority sandbox access';
    if (plan === 'PROFESSIONAL') return 'Small/Medium Enterprise (< 250 employees, < EUR 50M turnover) - Priority sandbox access';
    return 'Enterprise - Standard sandbox access';
  }
}

@Controller('sandbox')
export class SandboxController {
  constructor(private s: SandboxService) {}
  @Get() @ApiOperation({ summary: 'Sandbox info, benefits, and operational sandboxes' }) info() { return this.s.getInfo(); }
  @Post('application/:systemId/:country') @ApiOperation({ summary: 'Generate sandbox application package for a system' }) generate(@Param('systemId') sid: string, @Param('country') c: string, @CurrentUser('organizationId') o: string) { return this.s.generateApplication(o, sid, c); }
}

@Module({ imports: [PrismaModule], controllers: [SandboxController], providers: [SandboxService], exports: [SandboxService] })
export class SandboxModule {}

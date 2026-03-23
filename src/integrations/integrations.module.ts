import { BadRequestException, Body, Controller, Delete, Get, Injectable, Logger, Module, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';
import * as crypto from 'crypto';

// ============================================================
// GITHUB/GITLAB CI/CD INTEGRATION
// Runs compliance check as part of PR/pipeline
// ============================================================
interface CiCheckResult {
  status: 'PASS' | 'WARN' | 'FAIL';
  systemName: string;
  riskLevel: string;
  complianceScore: number;
  criticalFindings: number;
  checks: { name: string; status: string; detail: string }[];
  badgeUrl: string;
}

// ============================================================
// INTEGRATION CONFIGS
// ============================================================
const INTEGRATION_TYPES = ['github', 'gitlab', 'jira', 'linear', 'slack', 'teams', 'discord'] as const;
type IntegrationType = typeof INTEGRATION_TYPES[number];

interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  webhookUrl?: string;
  apiToken?: string;
  projectKey?: string;
  channel?: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

class CreateIntegrationDto {
  @IsString() type: string;
  @IsString() name: string;
  @IsString() @IsOptional() webhookUrl?: string;
  @IsString() @IsOptional() apiToken?: string;
  @IsString() @IsOptional() projectKey?: string;
  @IsString() @IsOptional() channel?: string;
  @IsArray() @IsOptional() events?: string[];
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  constructor(private prisma: PrismaService) {}

  // CI/CD: Generate compliance check for GitHub Actions / GitLab CI
  async generateCiConfig(orgId: string, platform: 'github' | 'gitlab') {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const apiKey = await this.prisma.apiKeyRecord.findFirst({ where: { organizationId: orgId }, select: { keyPrefix: true } });

    if (platform === 'github') {
      return {
        platform: 'GitHub Actions',
        filename: '.github/workflows/agentops-compliance.yml',
        content: `name: AgentOps Compliance Check
on:
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 8 * * 1'  # Weekly Monday 8AM

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - name: AgentOps Compliance Check
        env:
          AGENTOPS_API_KEY: \${{ secrets.AGENTOPS_API_KEY }}
          AGENTOPS_URL: \${{ secrets.AGENTOPS_URL }}
        run: |
          RESPONSE=$(curl -s -H "Authorization: Bearer $AGENTOPS_API_KEY" \\
            "$AGENTOPS_URL/api/v1/integrations/ci/check")
          SCORE=$(echo $RESPONSE | jq -r '.complianceScore')
          STATUS=$(echo $RESPONSE | jq -r '.status')
          echo "Compliance Score: $SCORE/100"
          echo "Status: $STATUS"
          if [ "$STATUS" = "FAIL" ]; then
            echo "::error::Compliance check FAILED. Score: $SCORE/100"
            exit 1
          fi
          if [ "$STATUS" = "WARN" ]; then
            echo "::warning::Compliance check has warnings. Score: $SCORE/100"
          fi`,
        setup: [
          'Go to repo Settings > Secrets > Actions',
          `Add AGENTOPS_API_KEY: ${apiKey ? apiKey.keyPrefix + '...' : 'Generate at /api/v1/api-keys'}`,
          `Add AGENTOPS_URL: https://agentops-api.onrender.com`,
          'Commit the workflow file to your repo',
        ],
      };
    }

    return {
      platform: 'GitLab CI',
      filename: '.gitlab-ci.yml (add stage)',
      content: `agentops-compliance:
  stage: test
  image: curlimages/curl:latest
  script:
    - |
      RESPONSE=$(curl -s -H "Authorization: Bearer $AGENTOPS_API_KEY" \\
        "$AGENTOPS_URL/api/v1/integrations/ci/check")
      SCORE=$(echo $RESPONSE | jq -r '.complianceScore')
      STATUS=$(echo $RESPONSE | jq -r '.status')
      echo "Compliance Score: $SCORE/100"
      if [ "$STATUS" = "FAIL" ]; then exit 1; fi
  only:
    - merge_requests
    - schedules`,
      setup: [
        'Go to Settings > CI/CD > Variables',
        `Add AGENTOPS_API_KEY: ${apiKey ? apiKey.keyPrefix + '...' : 'Generate at /api/v1/api-keys'}`,
        `Add AGENTOPS_URL: https://agentops-api.onrender.com`,
      ],
    };
  }

  // CI check endpoint (called by CI/CD pipelines)
  async runCiCheck(orgId: string): Promise<CiCheckResult> {
    const systems = await this.prisma.aiSystem.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { findings: { where: { deletedAt: null, status: 'OPEN', severity: { in: ['CRITICAL', 'HIGH'] } } } },
    });

    const checks: CiCheckResult['checks'] = [];
    let worstStatus: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    let totalScore = 0;
    let criticalFindings = 0;

    for (const sys of systems) {
      const crits = sys.findings.filter(f => f.severity === 'CRITICAL').length;
      const highs = sys.findings.filter(f => f.severity === 'HIGH').length;
      criticalFindings += crits;

      if (crits > 0) { checks.push({ name: `${sys.name}: Critical findings`, status: 'FAIL', detail: `${crits} CRITICAL findings open` }); worstStatus = 'FAIL'; }
      else if (highs > 0) { checks.push({ name: `${sys.name}: High findings`, status: 'WARN', detail: `${highs} HIGH findings open` }); if (worstStatus !== 'FAIL') worstStatus = 'WARN'; }
      else { checks.push({ name: `${sys.name}: No critical/high findings`, status: 'PASS', detail: 'Clean' }); }

      if (sys.riskLevel === 'UNACCEPTABLE') { checks.push({ name: `${sys.name}: Prohibited`, status: 'FAIL', detail: 'System classified as UNACCEPTABLE (Art. 5)' }); worstStatus = 'FAIL'; }
      if (sys.riskLevel === 'HIGH' && sys.complianceStatus === 'NOT_ASSESSED') { checks.push({ name: `${sys.name}: Not assessed`, status: 'WARN', detail: 'HIGH risk system not yet assessed' }); if (worstStatus !== 'FAIL') worstStatus = 'WARN'; }
    }

    if (systems.length === 0) { checks.push({ name: 'No AI systems registered', status: 'WARN', detail: 'Register your AI systems in AgentOps' }); worstStatus = 'WARN'; }

    const score = systems.length > 0 ? Math.round(systems.filter(s => s.complianceStatus === 'COMPLIANT').length / systems.length * 100) : 0;

    return { status: worstStatus, systemName: systems.map(s => s.name).join(', ') || 'None', riskLevel: systems.map(s => s.riskLevel).join(', ') || 'N/A', complianceScore: score, criticalFindings, checks, badgeUrl: `/api/v1/integrations/badge/${orgId}` };
  }

  // Jira: Create finding as Jira issue
  generateJiraPayload(finding: any, systemName: string) {
    return {
      fields: {
        project: { key: '{JIRA_PROJECT_KEY}' },
        summary: `[AgentOps] ${finding.title} - ${systemName}`,
        description: `*Severity:* ${finding.severity}\n*Article:* ${finding.articleRef || 'N/A'}\n*Area:* ${finding.area || finding.category}\n\n${finding.description}\n\n*Remediation:*\n${finding.remediation}\n\n*Estimated Effort:* ${finding.estimatedEffort}\n\n---\n_Created by AgentOps EU AI Act Compliance_`,
        issuetype: { name: finding.severity === 'CRITICAL' ? 'Bug' : 'Task' },
        priority: { name: finding.severity === 'CRITICAL' ? 'Highest' : finding.severity === 'HIGH' ? 'High' : 'Medium' },
        labels: ['agentops', 'eu-ai-act', 'compliance', finding.severity.toLowerCase()],
      },
    };
  }

  // Slack/Teams: Format notification
  formatSlackNotification(event: string, data: any) {
    const icons: Record<string, string> = { 'assessment.completed': ':white_check_mark:', 'finding.critical': ':rotating_light:', 'deadline.approaching': ':alarm_clock:', 'score.changed': ':chart_with_upwards_trend:' };
    return {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${icons[event] || ':bell:'} AgentOps: ${event.replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase())}` } },
        { type: 'section', text: { type: 'mrkdwn', text: data.message || JSON.stringify(data) } },
        ...(data.score !== undefined ? [{ type: 'section', fields: [{ type: 'mrkdwn', text: `*Score:* ${data.score}/100` }, { type: 'mrkdwn', text: `*Risk:* ${data.riskLevel || 'N/A'}` }] }] : []),
        { type: 'context', elements: [{ type: 'mrkdwn', text: `AgentOps | ${new Date().toISOString().split('T')[0]}` }] },
      ],
    };
  }

  formatTeamsNotification(event: string, data: any) {
    return {
      '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
      themeColor: event.includes('critical') ? 'FF0000' : event.includes('completed') ? '00FF00' : '0076D7',
      summary: `AgentOps: ${event}`,
      sections: [{
        activityTitle: `AgentOps: ${event.replace('.', ' ')}`,
        facts: [{ name: 'Event', value: event }, ...(data.score ? [{ name: 'Score', value: `${data.score}/100` }] : []), ...(data.riskLevel ? [{ name: 'Risk', value: data.riskLevel }] : [])],
        text: data.message || '',
      }],
    };
  }

  // CRUD for integration configs
  async list(orgId: string): Promise<IntegrationConfig[]> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return (org?.settings as any)?.integrations || [];
  }

  async create(orgId: string, dto: CreateIntegrationDto): Promise<IntegrationConfig> {
    const integration: IntegrationConfig = {
      id: crypto.randomUUID(), type: dto.type as IntegrationType, name: dto.name,
      webhookUrl: dto.webhookUrl, apiToken: dto.apiToken ? '***' + dto.apiToken.slice(-4) : undefined,
      projectKey: dto.projectKey, channel: dto.channel,
      events: dto.events || ['assessment.completed', 'finding.critical', 'deadline.approaching'],
      active: true, createdAt: new Date().toISOString(),
    };
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const integrations = [...((org?.settings as any)?.integrations || []), integration];
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: { ...(org?.settings as any || {}), integrations } } });
    return integration;
  }

  async remove(orgId: string, integrationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const integrations = ((org?.settings as any)?.integrations || []).filter((i: any) => i.id !== integrationId);
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: { ...(org?.settings as any || {}), integrations } } });
    return { removed: true };
  }
}

@ApiTags('Integrations') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('integrations')
export class IntegrationsController {
  constructor(private s: IntegrationsService) {}
  @Get() @ApiOperation({ summary: 'List configured integrations' }) list(@CurrentUser('organizationId') o: string) { return this.s.list(o); }
  @Post() @ApiOperation({ summary: 'Add integration (GitHub, GitLab, Jira, Slack, Teams)' }) create(@Body() dto: CreateIntegrationDto, @CurrentUser('organizationId') o: string) { return this.s.create(o, dto); }
  @Delete(':id') @ApiOperation({ summary: 'Remove integration' }) remove(@Param('id') id: string, @CurrentUser('organizationId') o: string) { return this.s.remove(o, id); }
  @Get('ci/config/:platform') @ApiOperation({ summary: 'Generate CI/CD config (github/gitlab)' }) ciConfig(@Param('platform') p: string, @CurrentUser('organizationId') o: string) { return this.s.generateCiConfig(o, p as any); }
  @Get('ci/check') @ApiOperation({ summary: 'Run compliance check (called by CI/CD pipelines)' }) ciCheck(@CurrentUser('organizationId') o: string) { return this.s.runCiCheck(o); }
  @Get('jira/payload-example') @ApiOperation({ summary: 'Example Jira issue payload for a finding' }) jiraExample() { return this.s.generateJiraPayload({ title: 'Missing Risk Management System', severity: 'CRITICAL', articleRef: 'Art. 9', area: 'RISK_MANAGEMENT', description: 'No documented risk management system found.', remediation: 'Implement continuous iterative risk management per Art. 9.', estimatedEffort: 'WEEKS' }, 'TalentMatch AI'); }
  @Get('slack/payload-example') @ApiOperation({ summary: 'Example Slack notification payload' }) slackExample() { return this.s.formatSlackNotification('assessment.completed', { message: 'Assessment completed for TalentMatch AI', score: 72, riskLevel: 'HIGH' }); }
  @Get('teams/payload-example') @ApiOperation({ summary: 'Example Teams notification payload' }) teamsExample() { return this.s.formatTeamsNotification('finding.critical', { message: 'New CRITICAL finding: Missing RMS', score: 35, riskLevel: 'HIGH' }); }
}

@Module({ imports: [PrismaModule], controllers: [IntegrationsController], providers: [IntegrationsService], exports: [IntegrationsService] })
export class IntegrationsModule {}

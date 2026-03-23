import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { CorrelationIdMiddleware, SecurityHeadersMiddleware } from './common/middleware';
import { PlanGuard } from './common/plan.guard';
import { SecurityRateLimitMiddleware, ContentSecurityPolicyMiddleware } from './demo/demo.module';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AiSystemsModule } from './ai-systems/ai-systems.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { FindingsModule } from './findings/findings.module';
import { DocumentsModule } from './documents/documents.module';
import { BillingModule } from './billing/billing.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SearchModule } from './search/search.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { I18nModule } from './i18n/i18n.module';
import { AssistantModule } from './assistant/assistant.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { IncidentsModule } from './incidents/incidents.module';
import { ExportModule } from './export/export.module';
import { ComplianceScoreModule } from './compliance-score/compliance-score.module';
import { DemoModule } from './demo/demo.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ComparatorModule } from './comparator/comparator.module';
import { TimelineModule } from './timeline/timeline.module';
import { ChecklistModule } from './checklist/checklist.module';
import { BenchmarkModule } from './benchmark/benchmark.module';
import { PenaltiesModule } from './penalties/penalties.module';
import { WizardModule } from './wizard/wizard.module';
import { GpaiModule } from './gpai/gpai.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { RagModule } from './rag/rag.module';
import { TemplatesModule } from './templates/templates.module';
import { BadgeModule } from './badge/badge.module';
import { UsComplianceModule } from './us-compliance/us-compliance.module';
import { ValidationModule } from './validation/validation.module';
import { PartnersModule } from './partners/partners.module';
import { AgentsModule } from './agents/agents.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },
      { name: 'medium', ttl: 10000, limit: 20 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AiSystemsModule,
    AssessmentsModule,
    FindingsModule,
    DocumentsModule,
    BillingModule,
    MonitoringModule,
    AnalyticsModule,
    SettingsModule,
    WebhooksModule,
    SearchModule,
    ReportsModule,
    NotificationsModule,
    I18nModule,
    AssistantModule,
    RoadmapModule,
    IncidentsModule,
    ExportModule,
    ComplianceScoreModule,
    DemoModule,
    ApiKeysModule,
    ComparatorModule,
    TimelineModule,
    ChecklistModule,
    BenchmarkModule,
    AgentsModule,
    HealthModule,
    PenaltiesModule,
    WizardModule,
    GpaiModule,
    SandboxModule,
    IntegrationsModule,
    RagModule,
    TemplatesModule,
    BadgeModule,
    UsComplianceModule,
    ValidationModule,
    PartnersModule,
  ],
  providers: [
    // Plan enforcement guard (checks @RequirePlan decorator)
    { provide: APP_GUARD, useClass: PlanGuard },
    // Rate limiting handled by SecurityRateLimitMiddleware (custom, per-route)
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, SecurityHeadersMiddleware, SecurityRateLimitMiddleware, ContentSecurityPolicyMiddleware).forRoutes('*');
  }
}

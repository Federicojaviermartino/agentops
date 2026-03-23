import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { AiProviderService } from './ai-provider.service';
import { ClassificationAgentService } from './classification-agent.service';
import { TechnicalAuditAgentService } from './technical-audit-agent.service';
import { DocumentationAgentService } from './documentation-agent.service';
import { BiasDetectionAgentService } from './bias-detection-agent.service';
import { AgentQualityService } from './agent-quality.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { S3Service } from '../common/s3.service';

@Module({
  imports: [PrismaModule],
  providers: [AiProviderService, ClassificationAgentService, TechnicalAuditAgentService, DocumentationAgentService, BiasDetectionAgentService, AgentQualityService, AgentOrchestratorService, S3Service],
  exports: [AiProviderService, ClassificationAgentService, TechnicalAuditAgentService, DocumentationAgentService, BiasDetectionAgentService, AgentQualityService, AgentOrchestratorService],
})
export class AgentsModule {}

// Re-exports for backward compatibility
export { AiProviderService } from './ai-provider.service';
export { ClassificationAgentService } from './classification-agent.service';
export { TechnicalAuditAgentService } from './technical-audit-agent.service';
export { DocumentationAgentService } from './documentation-agent.service';
export { BiasDetectionAgentService } from './bias-detection-agent.service';
export { AgentQualityService } from './agent-quality.service';
export { AgentOrchestratorService } from './agent-orchestrator.service';

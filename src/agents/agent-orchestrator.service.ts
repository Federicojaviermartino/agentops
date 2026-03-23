import { AiProviderService } from './ai-provider.service';
import { AgentQualityService } from './agent-quality.service';
import { BiasDetectionAgentService } from './bias-detection-agent.service';
import { TechnicalAuditAgentService } from './technical-audit-agent.service';
import { ClassificationAgentService } from './classification-agent.service';
import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  constructor(
    private classifier: ClassificationAgentService,
    private auditor: TechnicalAuditAgentService,
    private biasDetector: BiasDetectionAgentService,
    private quality: AgentQualityService,
  ) {}

  async runPipeline(params: { aiSystemId: string; systemDescription: string; purpose: string; sector: string; dataTypes: string[]; deploymentContext: string; affectedPopulation: string; repoUrl?: string; pipelineType?: string }) {
    const start = Date.now();
    const results: any = { promptVersion: AiProviderService.PROMPT_VERSION };

    // Step 1: Classification (always)
    this.logger.log('Pipeline: Classification');
    results.classification = await this.classifier.classify({ systemDescription: params.systemDescription, purpose: params.purpose, sector: params.sector, dataTypes: params.dataTypes, deploymentContext: params.deploymentContext, affectedPopulation: params.affectedPopulation });
    this.quality.record('CLASSIFICATION', !!results.classification.riskLevel, results.classification.confidence || 0, results.classification.tokensUsed || 0, Date.now() - start);

    // Step 2: Halt if UNACCEPTABLE
    if (results.classification.riskLevel === 'UNACCEPTABLE') {
      results.halted = true;
      results.haltReason = 'Prohibited AI practice (Art. 5). System cannot be deployed in the EU.';
      results.durationMs = Date.now() - start;
      return results;
    }

    if (params.pipelineType === 'CLASSIFICATION_ONLY') { results.durationMs = Date.now() - start; return results; }

    // Step 3: Technical Audit (HIGH + LIMITED)
    if (['HIGH', 'LIMITED'].includes(results.classification.riskLevel)) {
      this.logger.log('Pipeline: Technical Audit');
      const auditStart = Date.now();
      results.audit = await this.auditor.audit({ aiSystemId: params.aiSystemId, systemDescription: params.systemDescription, purpose: params.purpose, riskLevel: results.classification.riskLevel, sector: params.sector, dataTypes: params.dataTypes, repoUrl: params.repoUrl });
      this.quality.record('TECHNICAL_AUDIT', (results.audit.areas?.length || 0) > 0, results.audit.overallScore / 100, results.audit.tokensUsed || 0, Date.now() - auditStart);
    }

    // Step 4: Bias Detection (if personal data)
    if (params.dataTypes.some(d => ['PERSONAL', 'BIOMETRIC', 'HEALTH', 'FINANCIAL'].includes(d)) && results.classification.riskLevel !== 'MINIMAL') {
      const healthy = await this.biasDetector.isHealthy();
      if (healthy) {
        this.logger.log('Pipeline: Bias Detection');
        results.biasDetection = await this.biasDetector.analyze({ systemId: params.aiSystemId, dataTypes: params.dataTypes });
      } else {
        results.biasDetection = { status: 'SKIPPED', reason: 'Service unavailable' };
      }
    }

    results.durationMs = Date.now() - start;
    results.agentsExecuted = Object.keys(results).filter(k => !['promptVersion', 'durationMs', 'halted', 'haltReason', 'agentsExecuted'].includes(k)).length;
    return results;
  }

  getQualityMetrics() { return this.quality.getAllStats(); }
}

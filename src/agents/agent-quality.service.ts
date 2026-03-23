import { AiProviderService } from './ai-provider.service';
import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class AgentQualityService {
  private metrics: { agent: string; valid: boolean; confidence: number; tokens: number; ms: number; ts: string }[] = [];

  record(agent: string, valid: boolean, confidence: number, tokens: number, ms: number) {
    this.metrics.push({ agent, valid, confidence, tokens, ms, ts: new Date().toISOString() });
    if (this.metrics.length > 2000) this.metrics = this.metrics.slice(-1000);
  }

  getStats(agent?: string) {
    const f = agent ? this.metrics.filter(m => m.agent === agent) : this.metrics;
    if (!f.length) return { totalCalls: 0, validRate: 0, avgConfidence: 0, avgTokens: 0, avgMs: 0 };
    return {
      totalCalls: f.length,
      validRate: Math.round(f.filter(m => m.valid).length / f.length * 100),
      avgConfidence: Math.round(f.reduce((s, m) => s + m.confidence, 0) / f.length * 100) / 100,
      avgTokens: Math.round(f.reduce((s, m) => s + m.tokens, 0) / f.length),
      avgMs: Math.round(f.reduce((s, m) => s + m.ms, 0) / f.length),
      promptVersion: AiProviderService.PROMPT_VERSION,
    };
  }

  getAllStats() {
    return {
      classification: this.getStats('CLASSIFICATION'),
      technicalAudit: this.getStats('TECHNICAL_AUDIT'),
      documentation: this.getStats('DOCUMENTATION'),
      biasDetection: this.getStats('BIAS_DETECTION'),
      overall: this.getStats(),
    };
  }
}

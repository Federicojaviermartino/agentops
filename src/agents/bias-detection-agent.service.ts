import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class BiasDetectionAgentService {
  private readonly logger = new Logger(BiasDetectionAgentService.name);
  private readonly url = process.env.BIAS_SERVICE_URL || 'http://localhost:8000';

  async analyze(input: any) {
    try {
      const res = await fetch(`${this.url}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (e) {
      this.logger.warn(`Bias service unavailable: ${(e as Error).message}`);
      return { overallBiasScore: -1, overallStatus: 'NOT_ASSESSED', metrics: [], recommendations: ['Bias detection service unavailable.'] };
    }
  }

  async isHealthy(): Promise<boolean> {
    try { const url = process.env.BIAS_SERVICE_URL || 'http://localhost:8000'; const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) }); return r.ok; }
    catch { return false; }
  }
}

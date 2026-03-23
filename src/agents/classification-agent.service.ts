import { HEURISTICS } from './agents.constants';
import { AiProviderService } from './ai-provider.service';
import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class ClassificationAgentService {
  private readonly logger = new Logger(ClassificationAgentService.name);
  constructor(private aiProvider: AiProviderService) {}

  async classify(params: { systemDescription: string; purpose: string; sector: string; dataTypes: string[]; deploymentContext: string; affectedPopulation: string }) {
    // Step 1: Check heuristics first (deterministic, no LLM cost)
    for (const h of HEURISTICS) {
      const value = (params as any)[h.field] || '';
      if (typeof value === 'string' && h.pattern.test(value)) {
        this.logger.log(`Heuristic: ${h.reason}`);
        const llm = await this.callLLM(params);
        if (this.riskOrder(h.level) > this.riskOrder(llm.riskLevel)) { llm.riskLevel = h.level as any; llm.reasoning = `${h.reason}. ${llm.reasoning}`; llm.confidence = Math.max(llm.confidence, 0.9); }
        return llm;
      }
    }
    // Step 2: Self-consistency voting (3 runs, majority vote) for higher accuracy
    return this.classifyWithConsistency(params);
  }

  private async classifyWithConsistency(params: any, runs = 3) {
    const results = await Promise.all(
      Array.from({ length: runs }, (_, i) => this.callLLM(params, i === 0 ? 0.1 : 0.4))
    );
    // Majority vote on riskLevel
    const votes: Record<string, number> = {};
    for (const r of results) { votes[r.riskLevel] = (votes[r.riskLevel] || 0) + 1; }
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    const winnerLevel = winner[0];
    const agreement = winner[1] / runs;
    // Pick the result that matches the majority with highest confidence
    const best = results.filter(r => r.riskLevel === winnerLevel).sort((a, b) => b.confidence - a.confidence)[0];
    best.confidence = Math.min(1, best.confidence * (0.7 + 0.3 * agreement)); // Boost confidence with agreement
    best.reasoning = `[Self-consistency: ${runs} runs, ${Math.round(agreement * 100)}% agreement] ${best.reasoning}`;
    this.logger.log(`Self-consistency: ${JSON.stringify(votes)} -> ${winnerLevel} (${Math.round(agreement * 100)}%)`);
    return best;
  }

  private async callLLM(params: any, temperature = 0.1) {
    const response = await this.aiProvider.complete({
      systemPrompt: `You are an EU AI Act Risk Classification Expert (Regulation EU 2024/1689).

## CHAIN OF THOUGHT: Follow these 5 steps IN ORDER. Show reasoning at each step.
Step 1 - PROHIBITED (Art. 5): Social scoring? Subliminal manipulation? Exploitation of vulnerable groups? Real-time biometric ID in public? If YES -> UNACCEPTABLE.
Step 2 - HIGH via Annex I: Safety component of EU-regulated product (medical devices, machinery, vehicles)? If YES -> HIGH.
Step 3 - HIGH via Annex III (8 domains): (1) Biometric ID, (2) Critical infrastructure, (3) Education/assessment, (4) Employment/recruitment, (5) Essential services (credit/insurance), (6) Law enforcement, (7) Migration/border, (8) Justice/democracy. If ANY match -> HIGH.
Step 4 - LIMITED (Art. 50): Interacts with persons? Generates content? Detects emotions? Deep fakes? If YES -> LIMITED.
Step 5 - Default -> MINIMAL.

## FEW-SHOT EXAMPLES
"AI screening job applicants via CV analysis" -> Step 3, Domain 4 (employment) -> HIGH
"Customer support chatbot" -> Step 4 (interacts with persons) -> LIMITED
"Social credit scoring for government benefits" -> Step 1 (social scoring) -> UNACCEPTABLE
"Internal inventory optimization" -> Step 5 (none apply) -> MINIMAL

Respond ONLY valid JSON: { "riskLevel": "UNACCEPTABLE|HIGH|LIMITED|MINIMAL", "confidence": 0-1, "reasoning": "Step-by-step chain of thought", "stepReached": 1-5, "articleReferences": [], "annexReferences": [], "obligations": [], "alternativeClassification": null }`,
      userPrompt: `Classify: ${params.systemDescription}\nPurpose: ${params.purpose}\nSector: ${params.sector}\nData: ${params.dataTypes?.join(', ')}\nDeployment: ${params.deploymentContext}\nAffected: ${params.affectedPopulation}`,
      maxTokens: 2000, temperature,
    });
    try {
      const p = JSON.parse(response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return { riskLevel: p.riskLevel || 'MINIMAL', confidence: Math.max(0, Math.min(1, p.confidence || 0.5)), reasoning: p.reasoning || '', articleReferences: p.articleReferences || [], annexReferences: p.annexReferences || [], obligations: p.obligations || [], tokensUsed: response.tokensUsed };
    } catch { return { riskLevel: 'MINIMAL' as const, confidence: 0.3, reasoning: 'Classification failed. Manual review recommended.', articleReferences: [], annexReferences: [], obligations: [], tokensUsed: response.tokensUsed }; }
  }
  private riskOrder(level: string): number { return { MINIMAL: 0, LIMITED: 1, HIGH: 2, UNACCEPTABLE: 3 }[level] ?? 0; }
}

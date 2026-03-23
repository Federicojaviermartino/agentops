import { AiProviderService } from './ai-provider.service';
import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class TechnicalAuditAgentService {
  private readonly logger = new Logger(TechnicalAuditAgentService.name);
  constructor(private aiProvider: AiProviderService) {}

  async audit(params: { aiSystemId: string; systemDescription: string; purpose: string; riskLevel: string; sector: string; dataTypes: string[]; repoUrl?: string }) {
    const startTime = Date.now();
    this.logger.log(`Starting audit for ${params.aiSystemId}`);
    let repoCtx = 'No repository connected.';
    if (params.repoUrl) {
      try {
        const m = await this.fetchRepoMeta(params.repoUrl);
        repoCtx = `Repo: ${params.repoUrl}\nLanguages: ${JSON.stringify(m.languages)}\nCI/CD: ${m.hasCiCd}\nTests: ${m.hasTests}\nDocker: ${m.hasDocker}`;
      } catch (e) { repoCtx = `Repo analysis failed: ${(e as Error).message}`; }
    }

    const response = await this.aiProvider.complete({
      systemPrompt: `You are an EU AI Act Technical Compliance Auditor using the ReAct (Reasoning + Acting) pattern.

## For each of these 7 areas, apply: THOUGHT (what regulation requires) -> OBSERVATION (what evidence exists) -> ACTION (score + findings)

Area 1: Risk Management (Art. 9) - continuous process, risk identification, testing, residual risk mitigation
Area 2: Data Governance (Art. 10) - training data quality, bias examination, special categories handling
Area 3: Technical Documentation (Art. 11) - Annex IV 9-section structure, lifecycle documentation
Area 4: Logging (Art. 12) - automatic event recording, 6-month retention, traceability
Area 5: Transparency (Art. 13) - instructions of use, accuracy levels, known limitations
Area 6: Human Oversight (Art. 14) - override capability, anomaly detection, confirmation bias awareness
Area 7: Accuracy & Robustness (Art. 15) - defined accuracy, adversarial resilience, cybersecurity, fail-safe

## Scoring: 90-100 compliant, 70-89 mostly, 50-69 partial, 25-49 major gaps, 0-24 non-compliant

Respond ONLY valid JSON: { "areas": [{ "article": "Art. 9", "name": "Risk Management", "score": 0-100, "thought": "reasoning", "findings": [{ "severity": "CRITICAL|HIGH|MEDIUM|LOW", "title": "...", "description": "...", "remediation": "...", "estimatedEffort": "HOURS|DAYS|WEEKS", "articleRef": "Art. 9(2)" }], "recommendations": [] }], "summary": "..." }`,
      userPrompt: `Audit:\n${params.systemDescription}\nPurpose: ${params.purpose}\nRisk: ${params.riskLevel}\nSector: ${params.sector}\nData: ${params.dataTypes.join(', ')}\n\n${repoCtx}`,
      maxTokens: 4000, temperature: 0.1,
    });

    try {
      const parsed = JSON.parse(response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      const areas = (parsed.areas || []).map((a: any) => ({ article: a.article, name: a.name, score: Math.max(0, Math.min(100, a.score || 0)), status: a.score >= 80 ? 'COMPLIANT' : a.score >= 50 ? 'PARTIAL' : 'NON_COMPLIANT', findings: a.findings || [], recommendations: a.recommendations || [] }));
      const allFindings = areas.flatMap((a: any, i: number) => (a.findings || []).map((f: any, j: number) => ({ id: `TA-${String(i * 10 + j + 1).padStart(3, '0')}`, area: a.name, article: a.article, severity: f.severity || 'MEDIUM', title: f.title || 'Finding', description: f.description || '', remediation: f.remediation || '', estimatedEffort: f.estimatedEffort || 'DAYS' })));
      const scored = areas.filter((a: any) => a.score > 0);
      const overallScore = scored.length > 0 ? Math.round(scored.reduce((s: number, a: any) => s + a.score, 0) / scored.length) : 0;
      return { overallScore, overallStatus: overallScore >= 80 ? 'COMPLIANT' : overallScore >= 50 ? 'PARTIAL' : 'NON_COMPLIANT', areas, findings: allFindings, summary: parsed.summary || `Score: ${overallScore}/100`, tokensUsed: response.tokensUsed, durationMs: Date.now() - startTime };
    } catch { return { overallScore: 0, overallStatus: 'NON_COMPLIANT', areas: [], findings: [], summary: 'Audit failed.', tokensUsed: response.tokensUsed, durationMs: Date.now() - startTime }; }
  }

  private async fetchRepoMeta(url: string) {
    const parts = url.replace(/\.git$/, '').replace(/\/$/, '').split('/');
    const [owner, repo] = [parts[parts.length - 2], parts[parts.length - 1]];
    const h: any = { 'User-Agent': 'AgentOps/1.0' };
    if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const [rd, langs, tree] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: h }).then(r => r.ok ? r.json() : {}),
      fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers: h }).then(r => r.ok ? r.json() : {}),
      fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers: h }).then(r => r.ok ? r.json() : { tree: [] }),
    ]);
    const files = (tree.tree || []).map((f: any) => f.path || '');
    return { languages: langs, hasCiCd: files.some((f: string) => f.includes('.github/workflows') || f.includes('.gitlab-ci')), hasTests: files.some((f: string) => f.includes('.test.') || f.includes('.spec.')), hasDocker: files.some((f: string) => f.toLowerCase().includes('dockerfile')), lastCommitDate: (rd as any).pushed_at || 'unknown' };
  }
}

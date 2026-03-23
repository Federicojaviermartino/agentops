import { Injectable, Logger, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { S3Service } from '../common/s3.service';
import * as crypto from 'crypto';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly cache = new Map<string, { content: string; tokensUsed: number; expiresAt: number }>();
  static readonly PROMPT_VERSION = '1.0.0'; // A03 FIX

  async complete(params: { systemPrompt: string; userPrompt: string; maxTokens?: number; temperature?: number }): Promise<{ content: string; tokensUsed: number }> {
    // A02 FIX: Check cache first
    const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ s: params.systemPrompt, u: params.userPrompt, t: params.temperature })).digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Cache hit: ${cacheKey.substring(0, 8)}`);
      return { content: cached.content, tokensUsed: 0 };
    }

    // A01 FIX: Retry with exponential backoff
    const result = await this.withRetry(async () => {
      try { return await this.callClaude(params); }
      catch (error) {
        this.logger.warn(`Claude failed: ${(error as Error).message}. Trying OpenAI.`);
        return await this.callOpenAI(params);
      }
    }, 3, 1000);

    // Store in cache (1 hour TTL)
    this.cache.set(cacheKey, { ...result, expiresAt: Date.now() + 3600000 });
    // Prune old entries
    if (this.cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.cache) { if (v.expiresAt < now) this.cache.delete(k); }
    }

    return result;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseDelay: number): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try { return await fn(); }
      catch (error) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        this.logger.warn(`Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('All retries exhausted');
  }

  private async callClaude(params: any) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(60000), // B07 FIX: 60s timeout
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514', max_tokens: params.maxTokens || 4000, temperature: params.temperature ?? 0.1, system: params.systemPrompt, messages: [{ role: 'user', content: params.userPrompt }] }),
    });
    if (res.status === 429) throw new Error('Claude API rate limited (429)');
    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    return { content: data.content?.map((b: any) => b.type === 'text' ? b.text : '').join('') || '', tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) };
  }

  private async callOpenAI(params: any) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o', max_tokens: params.maxTokens || 4000, temperature: params.temperature ?? 0.1, messages: [{ role: 'system', content: params.systemPrompt }, { role: 'user', content: params.userPrompt }] }),
    });
    if (res.status === 429) throw new Error('OpenAI API rate limited (429)');
    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', tokensUsed: data.usage?.total_tokens || 0 };
  }

  clearCache() { this.cache.clear(); }
  getCacheSize() { return this.cache.size; }
}

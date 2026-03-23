import { Body, Controller, Injectable, Logger, Module, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth , ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

// EU AI Act knowledge base - structured for instant answers without RAG overhead
const KNOWLEDGE: Record<string, { answer: string; articles: string[]; obligations: string[] }> = {
  'risk classification': { answer: 'The EU AI Act uses a 4-tier risk classification: Unacceptable (Art. 5, banned), High-risk (Art. 6 + Annex III, heavy obligations), Limited (Art. 50, transparency only), and Minimal (no specific obligations). Classification depends on the intended purpose and domain of deployment.', articles: ['Art. 5', 'Art. 6', 'Annex I', 'Annex III'], obligations: ['Classify all AI systems before Aug 2 2026', 'Register high-risk systems in EU database'] },
  'annex iv': { answer: 'Annex IV requires technical documentation covering: (1) general description, (2) detailed description of elements and development process, (3) monitoring/functioning/control info, (4) risk management system, (5) changes during lifecycle, (6) list of harmonised standards, (7) copy of EU declaration of conformity, (8) post-market monitoring description, (9) information submitted for EU database registration.', articles: ['Art. 11', 'Annex IV'], obligations: ['Create comprehensive technical documentation', 'Keep documentation updated throughout lifecycle'] },
  'high risk': { answer: 'High-risk AI systems are defined in Art. 6 and listed in Annex III across 8 domains: (1) biometric identification, (2) critical infrastructure, (3) education/vocational training, (4) employment/worker management, (5) essential services access (credit, insurance), (6) law enforcement, (7) migration/asylum/border control, (8) justice/democratic processes. Each must comply with Art. 8-15.', articles: ['Art. 6', 'Art. 8-15', 'Annex III'], obligations: ['Risk management system (Art. 9)', 'Data governance (Art. 10)', 'Technical documentation (Art. 11)', 'Record-keeping (Art. 12)', 'Transparency (Art. 13)', 'Human oversight (Art. 14)', 'Accuracy/robustness/security (Art. 15)'] },
  'transparency': { answer: 'Art. 50 transparency obligations apply to: (a) AI systems interacting with persons must disclose they are AI, (b) emotion recognition systems must inform users, (c) deep fakes must be labelled, (d) AI-generated text on public interest must be labelled. These obligations apply regardless of risk level.', articles: ['Art. 50'], obligations: ['Disclose AI interaction to users', 'Label deep fakes and AI-generated content', 'Label emotion recognition systems'] },
  'fines penalties': { answer: 'Penalties scale by violation type: up to 35M EUR or 7% global turnover for prohibited practices, up to 15M EUR or 3% for high-risk violations, up to 7.5M EUR or 1% for incorrect information to authorities. For SMEs and startups, the lower amount applies. Member States set their own penalty rules within these maximums.', articles: ['Art. 99'], obligations: ['Ensure compliance before enforcement', 'Document all compliance efforts'] },
  'provider obligations': { answer: 'Providers (who develop or commission AI systems) must: implement quality management system, maintain technical documentation, ensure conformity assessment before placing on market, register in EU database, affix CE marking, cooperate with authorities, take corrective action when non-compliant, establish post-market monitoring system.', articles: ['Art. 16-22'], obligations: ['Quality management system', 'Conformity assessment', 'CE marking', 'EU database registration', 'Post-market monitoring'] },
  'deployer obligations': { answer: 'Deployers (who use AI systems professionally) must: use systems according to instructions, ensure human oversight, monitor operation, keep logs for at least 6 months, inform employees about AI use, conduct FRIA (Fundamental Rights Impact Assessment) for certain uses, cooperate with authorities.', articles: ['Art. 26', 'Art. 27'], obligations: ['Follow instructions of use', 'Human oversight', 'Keep operation logs 6+ months', 'Inform employees', 'FRIA when required'] },
  'conformity assessment': { answer: 'High-risk AI systems require conformity assessment before market placement. Most can use internal control (Annex VI). Biometric identification systems used by law enforcement require third-party assessment by a notified body (Annex VII). The assessment verifies compliance with all Art. 8-15 requirements.', articles: ['Art. 43', 'Annex VI', 'Annex VII'], obligations: ['Complete assessment before Aug 2 2026', 'Maintain assessment documentation', 'Repeat when significant modifications'] },
  'incident reporting': { answer: 'Providers must report serious incidents to market surveillance authorities. Serious incidents include death, serious health damage, serious disruption to critical infrastructure, or serious breach of fundamental rights. Initial report within 72 hours, detailed follow-up within 15 days.', articles: ['Art. 73'], obligations: ['Report within 72 hours', 'Detailed follow-up within 15 days', 'Implement incident detection mechanisms'] },
  'gdpr intersection': { answer: 'The AI Act works alongside GDPR. Key intersections: (1) data governance under Art. 10 must respect GDPR, (2) FRIA under Art. 27 extends DPIA concepts, (3) automated decision-making under GDPR Art. 22 applies to AI decisions, (4) data minimization principles apply to training data, (5) right to explanation may require AI explainability.', articles: ['Art. 10', 'Art. 27', 'GDPR Art. 22', 'GDPR Art. 35'], obligations: ['Conduct DPIA for high-risk AI processing personal data', 'Ensure lawful basis for AI training data', 'Implement Art. 22 safeguards for automated decisions'] },
  'sme measures': { answer: 'The AI Act includes SME-specific measures: (1) priority access to regulatory sandboxes (Art. 62), (2) reduced conformity assessment fees, (3) simplified quality management system elements, (4) guidance channels for SMEs, (5) proportional penalties (lower of absolute or percentage). The Commission is developing simplified compliance guidelines for SMEs.', articles: ['Art. 62', 'Recital 141-143'], obligations: ['Apply for sandbox access if available', 'Use simplified compliance where permitted'] },
  'eu database': { answer: 'Art. 71 requires registration in the EU database before placing high-risk AI systems on the market. The database is public and managed by the European Commission. Registration includes system identification, provider details, intended purpose, conformity assessment info, and status. Deployers of high-risk systems in public sector must also register.', articles: ['Art. 71'], obligations: ['Register before market placement', 'Keep registration updated', 'Include conformity assessment reference'] },
  'post market monitoring': { answer: 'Art. 72 requires providers to establish a post-market monitoring system proportionate to the nature and risks of the AI system. The system must actively collect, document, and analyze relevant data throughout the system lifecycle. For high-risk systems, this includes incident detection, drift monitoring, and feedback analysis. The monitoring plan must be part of the technical documentation.', articles: ['Art. 72'], obligations: ['Establish monitoring system', 'Include monitoring plan in documentation', 'Analyze data throughout lifecycle'] },
  'prohibited practices': { answer: 'Art. 5 prohibits: (a) subliminal manipulation, (b) exploitation of vulnerable groups, (c) social scoring by public authorities, (d) real-time remote biometric identification in public spaces for law enforcement (with exceptions), (e) untargeted scraping of facial images, (f) emotion recognition in workplaces and education (with exceptions), (g) biometric categorization for inferring sensitive attributes. These bans are already in force since Feb 2 2025.', articles: ['Art. 5'], obligations: ['Immediately cease any prohibited AI practices', 'Audit existing systems against prohibited list'] },
};

class AskDto { @IsString() question: string; @IsString() locale?: string; }

const LEGAL_DISCLAIMER = 'This response is AI-generated and does not constitute legal advice. Consult a qualified professional for compliance decisions.';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  async ask(question: string, locale = 'en', orgContext?: { systemCount?: number; highRiskCount?: number }) {
    const q = question.toLowerCase();
    const startTime = Date.now();

    // Find matching knowledge entries
    const matches: typeof KNOWLEDGE[string][] = [];
    for (const [key, value] of Object.entries(KNOWLEDGE)) {
      const keywords = key.split(/\s+/);
      if (keywords.some(kw => q.includes(kw)) || q.includes(key)) {
        matches.push(value);
      }
    }

    // Additional keyword matching for common questions
    const topicMap: Record<string, string[]> = {
      'fine|penalty|sanction|multa': ['fines penalties'],
      'document|annex iv|documentac': ['annex iv'],
      'high.risk|alto riesgo|high risk': ['high risk'],
      'classify|classif|clasificar': ['risk classification'],
      'transpar|art.?50|chatbot|disclose': ['transparency'],
      'provider|proveedor|develop': ['provider obligations'],
      'deployer|desplegador|user of ai': ['deployer obligations'],
      'gdpr|data protect|rgpd|privacy': ['gdpr intersection'],
      'sme|pyme|small|startup': ['sme measures'],
      'incident|report|72 hour|serious': ['incident reporting'],
      'database|register|eu db|art.?71': ['eu database'],
      'monitor|post.market|drift': ['post market monitoring'],
      'prohibit|banned|forbid|social scor': ['prohibited practices'],
      'conform|assessment|ce mark': ['conformity assessment'],
    };

    for (const [pattern, topics] of Object.entries(topicMap)) {
      if (new RegExp(pattern, 'i').test(q)) {
        for (const t of topics) {
          if (KNOWLEDGE[t] && !matches.includes(KNOWLEDGE[t])) matches.push(KNOWLEDGE[t]);
        }
      }
    }

    if (matches.length === 0) {
      // LLM FALLBACK: Use AI for questions not in hardcoded knowledge base
      try {
        const { AiProviderService } = require('../agents/agents.module');
        const provider = new AiProviderService();
        const llmResponse = await provider.complete({
          systemPrompt: 'You are an EU AI Act (Regulation EU 2024/1689) compliance expert. Answer the question precisely with article references. Keep answers under 200 words. Include specific article numbers.',
          userPrompt: question,
          maxTokens: 500,
          temperature: 0.2,
        });
        const articleMatches = llmResponse.content.match(/Art\.?\s*\d+/g) || [];
        return {
          answer: llmResponse.content,
          articles: [...new Set(articleMatches)],
          obligations: [],
          confidence: 0.7,
          source: 'llm',
          responseTimeMs: Date.now() - startTime,
          tokensUsed: llmResponse.tokensUsed,
        };
      } catch {
        return {
          answer: 'I can help with EU AI Act compliance questions. Topics I cover: risk classification, high-risk obligations (Art. 6-15), Annex IV documentation, transparency (Art. 50), fines (Art. 99), provider/deployer obligations, GDPR intersection, SME measures (Art. 62), incident reporting (Art. 73), conformity assessment (Art. 43), EU database (Art. 71), post-market monitoring (Art. 72), and prohibited practices (Art. 5). Try asking about any of these.',
          articles: [],
          obligations: [],
          confidence: 0.3,
          source: 'fallback',
          responseTimeMs: Date.now() - startTime,
        };
      }
    }

    const combined = {
      answer: matches.map(m => m.answer).join('\n\n'),
      articles: [...new Set(matches.flatMap(m => m.articles))],
      obligations: [...new Set(matches.flatMap(m => m.obligations))],
    };

    // Add org-specific context if available
    let contextNote = '';
    if (orgContext?.highRiskCount && orgContext.highRiskCount > 0) {
      contextNote = `\n\nBased on your organization: you have ${orgContext.highRiskCount} high-risk system(s) out of ${orgContext.systemCount} total. These require full compliance by August 2, 2026.`;
    }

    return {
      ...combined,
      answer: combined.answer + contextNote,
      confidence: matches.length > 1 ? 0.95 : 0.85,
      source: 'knowledge_base',
      responseTimeMs: Date.now() - startTime,
      topicsMatched: matches.length,
    };
  }

  getTopics() {
    return Object.keys(KNOWLEDGE).map(k => ({
      topic: k,
      articles: KNOWLEDGE[k].articles,
      preview: KNOWLEDGE[k].answer.substring(0, 100) + '...',
    }));
  }
}

@ApiTags('Assistant') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('assistant')
export class AssistantController {
  constructor(private s: AssistantService) {}

  @Post('ask') @ApiOperation({ summary: 'Ask' })
  async ask(@Body() dto: AskDto, @CurrentUser('organizationId') orgId: string) {
    return this.s.ask(dto.question, dto.locale);
  }

  @Post('topics') @ApiOperation({ summary: 'Topics' })
  topics() { return this.s.getTopics(); }
}

@Module({ imports: [PrismaModule], controllers: [AssistantController], providers: [AssistantService], exports: [AssistantService] })
export class AssistantModule {}

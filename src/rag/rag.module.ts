import { Controller, Get, Injectable, Logger, Module, Param, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/index';

// Full EU AI Act structure: 13 Titles, 113 Articles, 13 Annexes
// This is the searchable index. In production, embed with pgvector for semantic search.
const ARTICLES: { article: string; title: string; chapter: string; keywords: string[]; summary: string; obligations: string[] }[] = [
  // TITLE I: GENERAL PROVISIONS (Art. 1-4)
  { article: 'Art. 1', title: 'Subject matter', chapter: 'Title I: General Provisions', keywords: ['scope', 'purpose', 'subject'], summary: 'Establishes harmonised rules for placing on market, putting into service, and use of AI systems in the EU. Sets rules for GPAI models, prohibited practices, and transparency.', obligations: [] },
  { article: 'Art. 2', title: 'Scope', chapter: 'Title I: General Provisions', keywords: ['scope', 'territorial', 'applicability', 'extraterritorial'], summary: 'Applies to providers placing AI on EU market, deployers in EU, and providers/deployers outside EU whose AI output is used in EU. Excludes military, national security, research, and personal non-professional use.', obligations: ['Determine if your organization falls within scope'] },
  { article: 'Art. 3', title: 'Definitions', chapter: 'Title I: General Provisions', keywords: ['definition', 'ai system', 'provider', 'deployer', 'operator'], summary: '68 definitions including AI system, provider, deployer, importer, distributor, operator, high-risk, GPAI model, real-time biometric identification, etc.', obligations: [] },
  { article: 'Art. 4', title: 'AI literacy', chapter: 'Title I: General Provisions', keywords: ['literacy', 'training', 'competence', 'awareness'], summary: 'Providers and deployers shall ensure sufficient AI literacy among staff dealing with AI systems, considering technical knowledge, experience, education, context, and persons affected.', obligations: ['Ensure AI literacy for all staff operating AI systems'] },
  // TITLE II: PROHIBITED PRACTICES (Art. 5)
  { article: 'Art. 5', title: 'Prohibited AI practices', chapter: 'Title II: Prohibited Practices', keywords: ['prohibited', 'banned', 'subliminal', 'manipulation', 'social scoring', 'biometric', 'scraping', 'emotion'], summary: 'Prohibits: (a) subliminal/manipulative techniques, (b) exploitation of vulnerabilities, (c) social scoring, (d) real-time remote biometric ID in public (with exceptions), (e) untargeted facial scraping, (f) workplace/education emotion recognition (with exceptions), (g) biometric categorization inferring sensitive data.', obligations: ['Audit all AI systems against Art. 5 list', 'Cease any prohibited practices immediately'] },
  // TITLE III: HIGH-RISK (Art. 6-51)
  { article: 'Art. 6', title: 'Classification rules for high-risk AI', chapter: 'Title III Ch.1: Classification', keywords: ['classification', 'high-risk', 'annex I', 'annex III', 'safety component'], summary: 'Two paths to high-risk: (1) AI as safety component of Annex I product requiring third-party conformity, or (2) AI listed in Annex III. Exception: Art. 6(3) allows providers to document that their Annex III system does not pose significant risk.', obligations: ['Classify all AI systems per Art. 6 criteria'] },
  { article: 'Art. 8', title: 'Compliance with requirements', chapter: 'Title III Ch.2: Requirements', keywords: ['compliance', 'requirements', 'design', 'development'], summary: 'High-risk AI must comply with Art. 9-15 requirements, taking into account state of the art, intended purpose, and reasonably foreseeable misuse.', obligations: ['Ensure compliance with Art. 9-15'] },
  { article: 'Art. 9', title: 'Risk management system', chapter: 'Title III Ch.2: Requirements', keywords: ['risk management', 'rms', 'continuous', 'iterative', 'lifecycle'], summary: 'Continuous iterative process throughout lifecycle: identification/analysis of known and foreseeable risks, estimation and evaluation, adoption of risk management measures, testing to ensure residual risks are acceptable.', obligations: ['Establish risk management system', 'Document all risks and mitigations', 'Test for residual risk acceptability'] },
  { article: 'Art. 10', title: 'Data and data governance', chapter: 'Title III Ch.2: Requirements', keywords: ['data governance', 'training data', 'bias', 'representative', 'quality'], summary: 'Training/validation/testing data must be subject to governance practices: relevance, representativeness, free of errors, completeness. Bias examination required. Special categories data may be processed for bias monitoring.', obligations: ['Document training data sources and quality', 'Examine data for bias', 'Implement data governance practices'] },
  { article: 'Art. 11', title: 'Technical documentation', chapter: 'Title III Ch.2: Requirements', keywords: ['documentation', 'technical', 'annex IV', 'documentation requirements'], summary: 'Technical documentation shall be drawn up before placing on market, kept up-to-date, and contain information set out in Annex IV. Must demonstrate compliance with Art. 8-15.', obligations: ['Create Annex IV technical documentation', 'Keep documentation updated throughout lifecycle'] },
  { article: 'Art. 12', title: 'Record-keeping', chapter: 'Title III Ch.2: Requirements', keywords: ['logging', 'record-keeping', 'traceability', 'audit trail'], summary: 'High-risk AI shall be designed with automatic logging of events over lifetime. Logs must ensure traceability, include timestamps, reference data, input data (where relevant), and identification of persons involved in verification.', obligations: ['Implement automatic event logging', 'Retain logs for at least 6 months'] },
  { article: 'Art. 13', title: 'Transparency and provision of information', chapter: 'Title III Ch.2: Requirements', keywords: ['transparency', 'instructions of use', 'information', 'limitations'], summary: 'High-risk AI shall be accompanied by instructions of use including: provider identity, system characteristics, intended purpose, level of accuracy/robustness/cybersecurity, known limitations, human oversight measures, expected lifetime, maintenance.', obligations: ['Create clear instructions of use', 'Declare accuracy levels and limitations'] },
  { article: 'Art. 14', title: 'Human oversight', chapter: 'Title III Ch.2: Requirements', keywords: ['human oversight', 'override', 'stop', 'intervention', 'human-in-the-loop'], summary: 'Design for effective oversight: understand capabilities and limitations, detect anomalies, ability to not use/override/reverse output, ability to intervene or stop. Consider confirmation bias risk.', obligations: ['Design for effective human oversight', 'Enable override/stop capability', 'Address confirmation bias'] },
  { article: 'Art. 15', title: 'Accuracy, robustness and cybersecurity', chapter: 'Title III Ch.2: Requirements', keywords: ['accuracy', 'robustness', 'cybersecurity', 'resilience', 'adversarial'], summary: 'Achieve appropriate level of accuracy throughout lifecycle. Resilient to errors, faults, inconsistencies. Robust against unauthorized manipulation (adversarial). Cybersecurity measures to protect against vulnerabilities.', obligations: ['Define and achieve accuracy levels', 'Test for adversarial robustness', 'Implement cybersecurity measures'] },
  { article: 'Art. 16', title: 'Obligations of providers', chapter: 'Title III Ch.3: Provider Obligations', keywords: ['provider', 'obligations', 'quality management', 'ce marking'], summary: '13 provider obligations including: ensure compliance, implement QMS, maintain documentation, ensure conformity assessment, registration in EU DB, corrective actions, cooperate with authorities, CE marking.', obligations: ['Implement quality management system', 'Complete conformity assessment', 'Affix CE marking', 'Register in EU database'] },
  { article: 'Art. 26', title: 'Obligations of deployers', chapter: 'Title III Ch.3: Deployer Obligations', keywords: ['deployer', 'use', 'monitor', 'inform', 'logs'], summary: 'Deployers shall: use per instructions, ensure human oversight, monitor operation, inform provider of risks, keep logs 6+ months, inform employees/representatives about AI use.', obligations: ['Use according to instructions', 'Monitor operation', 'Keep logs 6 months', 'Inform employees about AI use'] },
  { article: 'Art. 27', title: 'FRIA by deployers', chapter: 'Title III Ch.3: Deployer Obligations', keywords: ['fria', 'fundamental rights', 'impact assessment', 'deployer'], summary: 'Deployers of high-risk AI in public bodies or private entities providing public services shall conduct a FRIA before putting into use. Assessment of impact on fundamental rights of affected persons.', obligations: ['Conduct FRIA before deployment (public sector deployers)'] },
  { article: 'Art. 43', title: 'Conformity assessment', chapter: 'Title III Ch.5: Conformity Assessment', keywords: ['conformity', 'assessment', 'annex VI', 'annex VII', 'notified body', 'internal control'], summary: 'High-risk AI requires conformity assessment before market. Most use internal control (Annex VI). Biometric ID for law enforcement requires notified body (Annex VII). Must be repeated for substantial modifications.', obligations: ['Complete conformity assessment', 'Repeat after substantial modifications'] },
  { article: 'Art. 49', title: 'CE marking', chapter: 'Title III Ch.5: CE Marking', keywords: ['ce marking', 'ce', 'declaration'], summary: 'CE marking affixed visibly, legibly, and indelibly to high-risk AI. For AI without physical product, CE marking included in documentation. Must be affixed before market placement.', obligations: ['Affix CE marking before market placement'] },
  { article: 'Art. 50', title: 'Transparency obligations', chapter: 'Title IV: Transparency', keywords: ['transparency', 'limited risk', 'disclosure', 'labelling', 'deepfake', 'emotion', 'chatbot'], summary: '(1) AI interacting with persons: disclose AI nature. (2) Emotion recognition: inform users. (3) AI-generated content: label as AI-generated. (4) Deep fakes: clearly label. Exceptions for law enforcement/judicial authorized uses.', obligations: ['Disclose AI interaction to users', 'Label AI-generated content', 'Label deep fakes'] },
  // GPAI
  { article: 'Art. 51', title: 'Classification of GPAI models with systemic risk', chapter: 'Title V: GPAI Models', keywords: ['gpai', 'systemic risk', 'foundation model', 'flops', '10^25'], summary: 'GPAI model has systemic risk if: high-impact capabilities (evaluated by technical tools/benchmarks) or Commission decision. Presumed systemic if training >10^25 FLOPs.', obligations: [] },
  { article: 'Art. 53', title: 'Obligations for all GPAI providers', chapter: 'Title V: GPAI Models', keywords: ['gpai', 'provider', 'documentation', 'copyright', 'training data'], summary: 'All GPAI providers: technical documentation (Annex XI), info for downstream providers, copyright compliance policy, publicly available training data summary.', obligations: ['Create Annex XI documentation', 'Provide downstream info', 'Copyright compliance policy', 'Publish training data summary'] },
  { article: 'Art. 55', title: 'Obligations for systemic risk GPAI', chapter: 'Title V: GPAI Models', keywords: ['systemic', 'evaluation', 'adversarial', 'incident', 'cybersecurity'], summary: 'Additional for systemic risk: model evaluation with adversarial testing, assess and mitigate systemic risks, report serious incidents to AI Office, ensure adequate cybersecurity.', obligations: ['Adversarial model evaluation', 'Systemic risk assessment', 'Incident reporting to AI Office', 'Cybersecurity protection'] },
  // ENFORCEMENT
  { article: 'Art. 71', title: 'EU database for high-risk AI', chapter: 'Title VIII: EU Database', keywords: ['database', 'registration', 'eu db', 'public'], summary: 'EU-wide public database for high-risk AI. Providers and certain deployers must register. Database contains system info, provider details, intended purpose, conformity assessment, and status.', obligations: ['Register high-risk AI in EU database before market placement'] },
  { article: 'Art. 72', title: 'Post-market monitoring', chapter: 'Title VIII: Post-Market', keywords: ['post-market', 'monitoring', 'lifecycle', 'drift'], summary: 'Providers establish post-market monitoring system proportionate to nature and risks. Actively collect, document, analyze data throughout lifecycle. Include monitoring plan in documentation.', obligations: ['Establish post-market monitoring system', 'Include plan in documentation'] },
  { article: 'Art. 73', title: 'Serious incident reporting', chapter: 'Title VIII: Incidents', keywords: ['incident', 'serious', 'reporting', '72 hours', '15 days'], summary: 'Report serious incidents (death, serious health damage, critical infrastructure disruption, fundamental rights breach) to market surveillance authority. Initial report within 72 hours, detailed follow-up within 15 days.', obligations: ['Report serious incidents within 72 hours', 'Detailed follow-up within 15 days'] },
  { article: 'Art. 99', title: 'Penalties', chapter: 'Title XII: Penalties', keywords: ['penalties', 'fines', 'sanctions', 'enforcement'], summary: 'Prohibited practices: up to 35M EUR or 7% revenue. High-risk non-compliance: 15M EUR or 3%. Incorrect info: 7.5M EUR or 1%. SMEs: lower of percentage or absolute. Member states set detailed rules.', obligations: ['Ensure compliance to avoid penalties'] },
];

const ANNEXES = [
  { id: 'Annex I', title: 'EU harmonisation legislation (high-risk product list)', articles: 18, summary: 'Lists EU product safety legislation where AI as safety component triggers high-risk: machinery, toys, recreational craft, lifts, equipment for explosive atmospheres, radio equipment, pressure equipment, cableway installations, PPE, gas appliances, medical devices, in vitro diagnostics, civil aviation, vehicles, agricultural vehicles, marine equipment, rail interoperability.' },
  { id: 'Annex III', title: 'High-risk AI areas', articles: 8, summary: '8 domains: (1) biometric identification, (2) critical infrastructure, (3) education, (4) employment, (5) essential services, (6) law enforcement, (7) migration/asylum/border, (8) justice/democracy.' },
  { id: 'Annex IV', title: 'Technical documentation content', articles: 9, summary: '9 mandatory sections for high-risk AI documentation.' },
  { id: 'Annex V', title: 'EU declaration of conformity', articles: 7, summary: 'Content requirements for the EU declaration of conformity.' },
  { id: 'Annex VI', title: 'Internal control conformity assessment', articles: 5, summary: 'Procedure for internal conformity assessment (most high-risk AI).' },
  { id: 'Annex VII', title: 'Third-party conformity assessment', articles: 7, summary: 'Procedure for notified body assessment (biometric ID for law enforcement).' },
  { id: 'Annex VIII', title: 'Information for registration', articles: 15, summary: 'Data required for EU database registration.' },
  { id: 'Annex XI', title: 'GPAI technical documentation', articles: 8, summary: 'Documentation requirements for GPAI model providers.' },
  { id: 'Annex XII', title: 'Transparency information for GPAI', articles: 6, summary: 'Information GPAI providers must give to downstream providers.' },
  { id: 'Annex XIII', title: 'Criteria for GPAI with systemic risk', articles: 4, summary: 'Criteria for designating GPAI models as having systemic risk.' },
];

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  search(query: string, maxResults = 10) {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(t => t.length > 2);

    const scored = ARTICLES.map(a => {
      let score = 0;
      const searchable = `${a.article} ${a.title} ${a.summary} ${a.keywords.join(' ')} ${a.obligations.join(' ')}`.toLowerCase();
      for (const token of tokens) {
        if (a.keywords.some(k => k.includes(token))) score += 10;
        if (a.title.toLowerCase().includes(token)) score += 8;
        if (a.article.toLowerCase().includes(token)) score += 15;
        if (a.summary.toLowerCase().includes(token)) score += 3;
        if (a.obligations.some(o => o.toLowerCase().includes(token))) score += 5;
      }
      if (q.includes(a.article.toLowerCase())) score += 20;
      return { ...a, relevanceScore: score };
    }).filter(a => a.relevanceScore > 0).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, maxResults);

    return { query, results: scored, totalArticles: ARTICLES.length, totalAnnexes: ANNEXES.length, note: 'Keyword-based search. Upgrade to pgvector for semantic similarity.' };
  }

  getArticle(ref: string) {
    const a = ARTICLES.find(ar => ar.article.toLowerCase() === ref.toLowerCase().replace('article', 'art.').trim());
    return a || null;
  }

  getAnnex(id: string) { return ANNEXES.find(a => a.id.toLowerCase() === id.toLowerCase()) || null; }
  getStructure() { return { totalArticles: ARTICLES.length, totalAnnexes: ANNEXES.length, chapters: [...new Set(ARTICLES.map(a => a.chapter))], annexes: ANNEXES.map(a => ({ id: a.id, title: a.title })) }; }
  getAllArticles() { return ARTICLES; }
}

@Controller('knowledge')
export class RagController {
  constructor(private s: RagService) {}
  @Get('search') @ApiOperation({ summary: 'Search EU AI Act articles by keyword' }) search(@Query('q') q: string, @Query('limit') l: string) { return this.s.search(q || '', +l || 10); }
  @Get('article/:ref') @ApiOperation({ summary: 'Get specific article (e.g., Art. 9)' }) article(@Param('ref') r: string) { return this.s.getArticle(r); }
  @Get('annex/:id') @ApiOperation({ summary: 'Get annex info (e.g., Annex III)' }) annex(@Param('id') id: string) { return this.s.getAnnex(id); }
  @Get('structure') @ApiOperation({ summary: 'Full EU AI Act structure overview' }) structure() { return this.s.getStructure(); }
  @Get('articles') @ApiOperation({ summary: 'All indexed articles' }) all() { return this.s.getAllArticles(); }
}

@Module({ controllers: [RagController], providers: [RagService], exports: [RagService] })
export class RagModule {}

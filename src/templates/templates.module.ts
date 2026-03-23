import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/index';

const TEMPLATES: { id: string; sector: string; name: string; description: string; riskLevel: string; annexDomain: string; sections: { number: string; title: string; content: string }[]; typicalFindings: string[]; plan: string }[] = [
  { id: 'fintech-credit', sector: 'Fintech', name: 'Credit Scoring AI', description: 'Annex IV template for AI systems assessing creditworthiness', riskLevel: 'HIGH', annexDomain: 'Annex III, Domain 5(b)',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system for automated credit scoring and creditworthiness assessment of natural persons. The system processes financial data, transaction history, and publicly available information to generate credit risk scores used in lending decisions.' },
      { number: '2', title: 'Development Process', content: 'Developed using supervised machine learning on historical lending data. Training data comprises [X] loan applications with known outcomes spanning [Y] years. Model architecture: [gradient boosting / neural network / ensemble]. Feature engineering includes income verification, debt-to-income ratio, payment history patterns, and employment stability indicators.' },
      { number: '3', title: 'Monitoring and Control', content: 'Real-time monitoring of score distribution drift, feature importance shifts, and approval rate changes by demographic group. Monthly model performance review. Quarterly bias audit per Art. 10. Alert thresholds for accuracy degradation below [X]%.' },
      { number: '4', title: 'Risk Management System', content: 'Continuous risk management per Art. 9. Key risks: discrimination based on protected characteristics, data quality degradation, concept drift in economic conditions, adversarial manipulation of input features. Mitigation: fairness constraints in training, regular retraining, input validation, human review for borderline cases.' },
      { number: '5', title: 'Lifecycle Changes', content: 'Version control of all model iterations. Change log documenting feature additions, data source changes, and retraining events. Impact assessment required before any model update affecting score calculation.' },
      { number: '6', title: 'Harmonised Standards', content: 'Aligned with: CEN/CENELEC AI standards (when published), ISO/IEC 42001 AI Management System, EBA Guidelines on loan origination and monitoring.' },
      { number: '7', title: 'EU Declaration of Conformity', content: '[Provider name and address]. We declare under sole responsibility that the above AI system complies with Regulation (EU) 2024/1689.' },
      { number: '8', title: 'Post-Market Monitoring', content: 'Monitoring plan: daily score distribution analysis, weekly fairness metrics review, monthly performance vs. actual outcomes, quarterly comprehensive audit. Incident response: automatic model rollback if accuracy drops below threshold.' },
      { number: '9', title: 'EU Database Registration', content: 'Registered under [registration number] in the EU AI database per Art. 71. Intended purpose: credit assessment for consumer lending. Provider: [company name]. Status: [active].' },
    ],
    typicalFindings: ['Demographic parity gap in approval rates', 'Missing documentation of training data sources', 'No human override for automated decisions', 'Insufficient explainability of individual scores'],
    plan: 'PROFESSIONAL',
  },
  { id: 'hrtech-recruit', sector: 'HRtech', name: 'Recruitment Screening AI', description: 'Template for CV screening and candidate ranking systems', riskLevel: 'HIGH', annexDomain: 'Annex III, Domain 4',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system for automated screening of job applications and candidate ranking. Processes CVs, cover letters, and application data to generate suitability scores for open positions.' },
      { number: '2', title: 'Development Process', content: 'NLP-based system trained on historical hiring data and successful employee profiles. Model processes text features (skills, experience, education) with optional structured data (years of experience, certifications).' },
      { number: '3', title: 'Monitoring and Control', content: 'Gender and ethnicity parity monitoring on screening outcomes. Weekly pipeline analytics. Human recruiter reviews all AI-recommended shortlists before candidate contact.' },
      { number: '4', title: 'Risk Management System', content: 'Primary risks: gender/age/ethnicity bias in historical hiring data, proxy discrimination via educational institutions or zip codes, over-reliance on keyword matching. Mitigations: de-biased training, blind screening mode, regular adverse impact analysis.' },
      { number: '5', title: 'Lifecycle Changes', content: 'Model retraining quarterly with new hiring outcome data. All changes documented and bias-tested before deployment.' },
      { number: '6', title: 'Harmonised Standards', content: 'ISO/IEC 42001, EEOC Uniform Guidelines (US operations), Art. 10 data governance requirements.' },
      { number: '7', title: 'EU Declaration of Conformity', content: '[Provider declaration per Annex V]' },
      { number: '8', title: 'Post-Market Monitoring', content: 'Adverse impact ratio monitoring per protected group. Monthly fairness reports. Employee information obligation per Art. 26(7).' },
      { number: '9', title: 'EU Database Registration', content: '[Registration details per Annex VIII]' },
    ],
    typicalFindings: ['Gender bias in CV scoring', 'Age proxy through graduation year', 'No employee notification per Art. 26(7)', 'Missing FRIA for public sector use'],
    plan: 'PROFESSIONAL',
  },
  { id: 'healthtech-diag', sector: 'Healthtech', name: 'Medical Diagnosis Assistant', description: 'Template for AI-assisted medical diagnosis systems', riskLevel: 'HIGH', annexDomain: 'Annex I (Medical Device Regulation) + Annex III',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system assisting medical professionals in diagnostic decision-making. Analyzes medical imaging, lab results, and patient records to suggest differential diagnoses and risk indicators.' },
      { number: '2', title: 'Development Process', content: 'Deep learning model trained on anonymized clinical datasets from [X] healthcare institutions. Validated against expert panel consensus diagnoses. Training data includes [Y] annotated cases across [Z] conditions.' },
      { number: '3', title: 'Monitoring and Control', content: 'Clinical performance monitoring: sensitivity, specificity, AUC per condition. Drift detection on input data distribution. Integration with hospital quality management systems.' },
      { number: '4', title: 'Risk Management System', content: 'Patient safety risk analysis per ISO 14971. Key risks: false negatives leading to missed diagnoses, automation bias in clinical decisions, performance degradation on underrepresented populations. Fail-safe: system always presents as assistive, never replaces clinician judgment.' },
      { number: '5', title: 'Lifecycle Changes', content: 'Regulatory change management per MDR. Re-validation required for new conditions, imaging modalities, or demographic populations.' },
      { number: '6', title: 'Harmonised Standards', content: 'MDR 2017/745, ISO 13485, ISO 14971, IEC 62304, ISO/IEC 42001.' },
      { number: '7', title: 'EU Declaration of Conformity', content: '[Dual conformity: MDR + AI Act per Art. 43]' },
      { number: '8', title: 'Post-Market Monitoring', content: 'PMCF plan per MDR. Vigilance reporting for adverse events. Clinical performance tracking per condition and demographic.' },
      { number: '9', title: 'EU Database Registration', content: 'EUDAMED registration (MDR) + EU AI database registration (AI Act).' },
    ],
    typicalFindings: ['Insufficient diversity in training data demographics', 'Missing fail-safe for edge cases', 'No MDR/AI Act dual conformity plan', 'Inadequate clinician training materials'],
    plan: 'PROFESSIONAL',
  },
  { id: 'edtech-assess', sector: 'Edtech', name: 'Student Assessment AI', description: 'Template for AI grading and student evaluation systems', riskLevel: 'HIGH', annexDomain: 'Annex III, Domain 3',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system for automated or semi-automated assessment of students including grading, plagiarism detection, and learning progress evaluation.' },
      { number: '2', title: 'Development Process', content: 'Trained on expert-graded assessments across [X] subjects. Uses NLP for essay evaluation, pattern matching for plagiarism, and adaptive testing algorithms for skill assessment.' },
      { number: '3', title: 'Monitoring and Control', content: 'Grade distribution monitoring by student demographics. Teacher override capability for all automated grades. Appeal process with human review.' },
      { number: '4', title: 'Risk Management System', content: 'Risks: cultural/linguistic bias in NLP grading, socioeconomic bias in writing style evaluation, over-reliance on AI grades. Mitigations: multi-rater calibration, bias testing per demographic, mandatory human review for consequential assessments.' },
      { number: '5', title: 'Lifecycle Changes', content: 'Annual curriculum alignment review. Bias testing after each training data update.' },
      { number: '6', title: 'Harmonised Standards', content: 'ISO/IEC 42001, educational assessment standards.' },
      { number: '7', title: 'EU Declaration of Conformity', content: '[Provider declaration]' },
      { number: '8', title: 'Post-Market Monitoring', content: 'Semester-end grade distribution analysis. Student complaint tracking. Teacher feedback integration.' },
      { number: '9', title: 'EU Database Registration', content: '[Registration details]' },
    ],
    typicalFindings: ['Language bias in essay scoring for non-native speakers', 'No student notification about AI grading', 'Missing appeal mechanism', 'Insufficient human oversight for final grades'],
    plan: 'STARTER',
  },
  { id: 'legaltech-analysis', sector: 'Legaltech', name: 'Legal Document Analysis AI', description: 'Template for AI-powered contract analysis and legal research', riskLevel: 'LIMITED', annexDomain: 'Art. 50 (transparency)',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system for automated analysis of legal documents, contract review, clause extraction, and legal research assistance. Interacts with legal professionals to provide recommendations.' },
      { number: '2', title: 'Development Process', content: 'LLM-based system fine-tuned on legal corpus. RAG architecture with curated legal databases.' },
      { number: '3', title: 'Transparency Notice', content: 'Users informed that they are interacting with an AI system. All AI-generated analysis clearly marked. Disclaimer that AI output does not constitute legal advice.' },
    ],
    typicalFindings: ['Missing AI disclosure to end users', 'No disclaimer about AI limitations', 'Hallucination risk in legal citations'],
    plan: 'STARTER',
  },
  { id: 'insurtech-risk', sector: 'Insurtech', name: 'Insurance Risk Assessment AI', description: 'Template for AI-powered insurance underwriting and pricing', riskLevel: 'HIGH', annexDomain: 'Annex III, Domain 5',
    sections: [
      { number: '1', title: 'General Description', content: 'AI system for automated insurance risk assessment, premium calculation, and underwriting decisions affecting access to insurance products.' },
      { number: '2', title: 'Development Process', content: 'Actuarial ML model trained on claims history, demographic data, and risk factors. Ensemble approach combining traditional actuarial methods with ML predictions.' },
      { number: '3', title: 'Monitoring and Control', content: 'Pricing fairness monitoring across protected groups. Claims ratio tracking per model version. Regulatory reporting compliance.' },
      { number: '4', title: 'Risk Management System', content: 'Risks: proxy discrimination via correlated variables, pricing fairness for protected groups, GDPR Art. 22 automated decision impact. Mitigations: fairness constraints, human review for denials, right to explanation implementation.' },
      { number: '5', title: 'Lifecycle Changes', content: 'Annual model recalibration with updated claims data.' },
      { number: '6', title: 'Harmonised Standards', content: 'Solvency II alignment, EIOPA guidelines, ISO/IEC 42001.' },
      { number: '7', title: 'EU Declaration of Conformity', content: '[Provider declaration]' },
      { number: '8', title: 'Post-Market Monitoring', content: 'Loss ratio monitoring, fairness metrics tracking, complaint analysis.' },
      { number: '9', title: 'EU Database Registration', content: '[Registration details]' },
    ],
    typicalFindings: ['Proxy discrimination via geographic data', 'No human review for automatic denials', 'Missing GDPR Art. 22 safeguards', 'Insufficient explainability of premium calculations'],
    plan: 'PROFESSIONAL',
  },
];

@Injectable()
export class TemplatesService {
  getAll() { return { templates: TEMPLATES.map(t => ({ id: t.id, sector: t.sector, name: t.name, description: t.description, riskLevel: t.riskLevel, annexDomain: t.annexDomain, sectionCount: t.sections.length, plan: t.plan })), total: TEMPLATES.length, sectors: [...new Set(TEMPLATES.map(t => t.sector))] }; }
  getBySector(sector: string) { return TEMPLATES.filter(t => t.sector.toLowerCase() === sector.toLowerCase()); }
  getById(id: string) { return TEMPLATES.find(t => t.id === id) || null; }
}

@Controller('templates')
export class TemplatesController {
  constructor(private s: TemplatesService) {}
  @Get() @ApiOperation({ summary: 'List all sector-specific Annex IV templates' }) all() { return this.s.getAll(); }
  @Get('sector/:sector') @ApiOperation({ summary: 'Templates by sector (fintech, hrtech, healthtech, edtech, legaltech, insurtech)' }) bySector(@Param('sector') s: string) { return this.s.getBySector(s); }
  @Get(':id') @ApiOperation({ summary: 'Get full template with pre-filled sections' }) byId(@Param('id') id: string) { return this.s.getById(id); }
}

@Module({ controllers: [TemplatesController], providers: [TemplatesService], exports: [TemplatesService] })
export class TemplatesModule {}

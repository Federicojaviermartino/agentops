import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/index';

// Public validation dataset: 50 AI systems with expert-verified risk classifications
// Used to benchmark classification accuracy (target: 95%+)
const DATASET: { id: number; description: string; purpose: string; sector: string; expectedRisk: string; annexRef: string; reasoning: string }[] = [
  { id: 1, description: 'CV screening tool for job applicants', purpose: 'Automated resume screening and candidate ranking', sector: 'HR', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 4', reasoning: 'Employment recruitment falls under Annex III domain 4.' },
  { id: 2, description: 'Credit scoring model for consumer loans', purpose: 'Evaluate creditworthiness of natural persons', sector: 'FINANCE', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5(b)', reasoning: 'Credit assessment affecting access to financial services.' },
  { id: 3, description: 'Customer support chatbot', purpose: 'Answer customer questions about products', sector: 'RETAIL', expectedRisk: 'LIMITED', annexRef: 'Art. 50(1)', reasoning: 'AI interacting with natural persons requires transparency disclosure.' },
  { id: 4, description: 'Social media content recommender', purpose: 'Personalize content feed based on user behavior', sector: 'TECH', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Content recommendation without consequential impact is minimal risk.' },
  { id: 5, description: 'Facial recognition for law enforcement', purpose: 'Real-time biometric identification in public spaces', sector: 'GOVERNMENT', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(d)', reasoning: 'Real-time remote biometric identification in public spaces for LE is prohibited (with narrow exceptions).' },
  { id: 6, description: 'AI radiology assistant', purpose: 'Detect anomalies in medical imaging', sector: 'HEALTHCARE', expectedRisk: 'HIGH', annexRef: 'Annex I (MDR) + Annex III', reasoning: 'Medical device AI is high-risk under both Annex I (MDR) and potential Annex III.' },
  { id: 7, description: 'Student exam grading system', purpose: 'Automatically grade student assessments', sector: 'EDUCATION', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 3', reasoning: 'Educational assessment AI falls under Annex III domain 3.' },
  { id: 8, description: 'Spam filter for email', purpose: 'Classify emails as spam or legitimate', sector: 'TECH', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Email spam filtering has no consequential impact on fundamental rights.' },
  { id: 9, description: 'AI-powered deepfake generator', purpose: 'Generate realistic synthetic video content', sector: 'MEDIA', expectedRisk: 'LIMITED', annexRef: 'Art. 50(4)', reasoning: 'Deep fake generation requires Art. 50 labelling obligations.' },
  { id: 10, description: 'Predictive policing system', purpose: 'Predict crime hotspots and potential offenders', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 6', reasoning: 'Law enforcement risk assessment and profiling is high-risk.' },
  { id: 11, description: 'Insurance claim fraud detection', purpose: 'Identify potentially fraudulent insurance claims', sector: 'INSURANCE', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5', reasoning: 'Affects access to insurance services (essential private services).' },
  { id: 12, description: 'Warehouse inventory optimizer', purpose: 'Optimize stock levels and reorder timing', sector: 'LOGISTICS', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Internal operations optimization with no impact on persons.' },
  { id: 13, description: 'Social scoring system for government benefits', purpose: 'Score citizens based on social behavior for benefit allocation', sector: 'GOVERNMENT', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(c)', reasoning: 'Social scoring by public authorities is explicitly prohibited.' },
  { id: 14, description: 'AI emotion recognition in workplace', purpose: 'Monitor employee emotions during work hours', sector: 'HR', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(f)', reasoning: 'Workplace emotion recognition is prohibited (with narrow exceptions).' },
  { id: 15, description: 'Autonomous vehicle perception system', purpose: 'Object detection for self-driving vehicles', sector: 'AUTOMOTIVE', expectedRisk: 'HIGH', annexRef: 'Annex I (Vehicle Safety)', reasoning: 'Safety component of vehicle subject to EU type-approval.' },
  { id: 16, description: 'Immigration visa processing AI', purpose: 'Evaluate visa and asylum applications', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 7', reasoning: 'Migration and asylum decision-making is high-risk.' },
  { id: 17, description: 'AI text content generator', purpose: 'Generate marketing copy and articles', sector: 'MEDIA', expectedRisk: 'LIMITED', annexRef: 'Art. 50(2)', reasoning: 'AI-generated text content requires transparency labelling.' },
  { id: 18, description: 'Water treatment plant AI controller', purpose: 'Manage water purification and distribution', sector: 'UTILITIES', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 2', reasoning: 'Critical infrastructure management is high-risk.' },
  { id: 19, description: 'AI chess game opponent', purpose: 'Play chess against human users', sector: 'ENTERTAINMENT', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Entertainment AI with no consequential impact.' },
  { id: 20, description: 'Bail/sentencing recommendation system', purpose: 'Recommend bail amounts and sentencing guidelines to judges', sector: 'LEGAL', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 8', reasoning: 'AI assisting judicial authorities is high-risk.' },
  { id: 21, description: 'Targeted advertising system', purpose: 'Select ads based on user profiles', sector: 'ADVERTISING', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'General ad targeting without consequential impact. Not in Annex III.' },
  { id: 22, description: 'AI-based proctoring for online exams', purpose: 'Monitor students during remote exams via webcam', sector: 'EDUCATION', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 3 + Domain 1', reasoning: 'Education monitoring + biometric identification make this high-risk.' },
  { id: 23, description: 'Emergency services dispatch AI', purpose: 'Prioritize and route 112/911 emergency calls', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5(d)', reasoning: 'AI dispatching emergency services affects access to essential services.' },
  { id: 24, description: 'Product recommendation engine', purpose: 'Suggest products based on browsing history', sector: 'RETAIL', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'E-commerce recommendations without consequential decisions.' },
  { id: 25, description: 'Subliminal advertising AI', purpose: 'Use subliminal techniques to influence purchasing decisions', sector: 'ADVERTISING', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(a)', reasoning: 'Subliminal manipulation techniques are prohibited.' },
  { id: 26, description: 'AI speech-to-text transcription', purpose: 'Transcribe audio to text', sector: 'TECH', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Transcription is a utility function with no consequential impact.' },
  { id: 27, description: 'Energy grid load balancing AI', purpose: 'Manage electricity distribution across grid', sector: 'ENERGY', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 2', reasoning: 'Energy critical infrastructure management.' },
  { id: 28, description: 'AI tutoring assistant', purpose: 'Provide personalized learning support to students', sector: 'EDUCATION', expectedRisk: 'LIMITED', annexRef: 'Art. 50(1)', reasoning: 'Tutoring AI interacts with persons but does not make consequential assessment decisions. Art. 50 transparency applies.' },
  { id: 29, description: 'Untargeted facial image scraping system', purpose: 'Scrape facial images from internet to build recognition database', sector: 'TECH', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(e)', reasoning: 'Untargeted scraping of facial images is explicitly prohibited.' },
  { id: 30, description: 'HR employee performance AI', purpose: 'Monitor and evaluate employee performance for promotion decisions', sector: 'HR', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 4', reasoning: 'Employee monitoring and promotion decisions fall under employment domain.' },
  // Additional 20 for robust benchmarking
  { id: 31, description: 'AI-powered weather forecast', purpose: 'Predict weather patterns', sector: 'SCIENCE', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Weather prediction has no direct impact on fundamental rights.' },
  { id: 32, description: 'Loan application pre-screening', purpose: 'Pre-filter mortgage applications', sector: 'FINANCE', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5(b)', reasoning: 'Access to mortgage credit is an essential financial service.' },
  { id: 33, description: 'AI music composition tool', purpose: 'Generate musical compositions', sector: 'ENTERTAINMENT', expectedRisk: 'LIMITED', annexRef: 'Art. 50(2)', reasoning: 'AI-generated content requires Art. 50 labelling.' },
  { id: 34, description: 'Border control passport verification', purpose: 'Automated passport and visa checking at borders', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 7', reasoning: 'Border control AI is high-risk under migration domain.' },
  { id: 35, description: 'AI code review assistant', purpose: 'Review code quality and suggest improvements', sector: 'TECH', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Developer tool with no direct person impact.' },
  { id: 36, description: 'Recidivism prediction tool', purpose: 'Assess likelihood of re-offending for parole decisions', sector: 'LEGAL', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 6', reasoning: 'Criminal recidivism assessment for law enforcement decisions.' },
  { id: 37, description: 'Biometric categorization by ethnicity', purpose: 'Categorize persons based on biometric data to infer ethnicity', sector: 'TECH', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(g)', reasoning: 'Biometric categorization inferring sensitive attributes is prohibited.' },
  { id: 38, description: 'Smart thermostat AI', purpose: 'Optimize home temperature based on habits', sector: 'CONSUMER', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Personal home device with no consequential impact.' },
  { id: 39, description: 'Social benefits eligibility AI', purpose: 'Determine eligibility for government welfare programs', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5(a)', reasoning: 'Access to public social benefits is essential service.' },
  { id: 40, description: 'Medical device safety component', purpose: 'AI monitoring vital signs in ICU equipment', sector: 'HEALTHCARE', expectedRisk: 'HIGH', annexRef: 'Annex I (MDR)', reasoning: 'Safety component of medical device under MDR.' },
  { id: 41, description: 'AI-generated profile photo tool', purpose: 'Generate synthetic profile pictures', sector: 'TECH', expectedRisk: 'LIMITED', annexRef: 'Art. 50(3)', reasoning: 'AI-generated images require labelling.' },
  { id: 42, description: 'Traffic management AI for city', purpose: 'Control traffic lights and flow in urban areas', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 2', reasoning: 'Urban traffic infrastructure management is critical infrastructure.' },
  { id: 43, description: 'Emotion detection in education', purpose: 'Monitor student engagement via facial expression analysis', sector: 'EDUCATION', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(f)', reasoning: 'Emotion recognition in educational institutions is prohibited.' },
  { id: 44, description: 'Supply chain optimization AI', purpose: 'Optimize logistics and delivery routes', sector: 'LOGISTICS', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Internal business optimization without person impact.' },
  { id: 45, description: 'AI lie detector for police', purpose: 'Detect deception during police interrogations', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 6(b)', reasoning: 'Polygraph/emotion detection by law enforcement is high-risk.' },
  { id: 46, description: 'Elevator safety AI controller', purpose: 'Monitor and control elevator safety systems', sector: 'CONSTRUCTION', expectedRisk: 'HIGH', annexRef: 'Annex I (Lifts Directive)', reasoning: 'Safety component of product covered by EU lifts directive.' },
  { id: 47, description: 'AI voter eligibility verification', purpose: 'Verify voter identity and eligibility', sector: 'GOVERNMENT', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 8', reasoning: 'AI in democratic processes is high-risk.' },
  { id: 48, description: 'Manipulation of vulnerable elderly', purpose: 'Exploit cognitive vulnerabilities of elderly users to influence purchases', sector: 'CONSUMER', expectedRisk: 'UNACCEPTABLE', annexRef: 'Art. 5(1)(b)', reasoning: 'Exploitation of age-related vulnerabilities is prohibited.' },
  { id: 49, description: 'AI plant disease detection', purpose: 'Identify crop diseases from leaf images', sector: 'AGRICULTURE', expectedRisk: 'MINIMAL', annexRef: 'None', reasoning: 'Agricultural tool with no direct person impact.' },
  { id: 50, description: 'Insurance pricing based on health data', purpose: 'Set insurance premiums using health predictions', sector: 'INSURANCE', expectedRisk: 'HIGH', annexRef: 'Annex III, Domain 5(c)', reasoning: 'Insurance access and pricing affecting natural persons.' },
];

@Injectable()
export class ValidationService {
  getDataset() { return { dataset: DATASET, total: DATASET.length, distribution: { UNACCEPTABLE: DATASET.filter(d => d.expectedRisk === 'UNACCEPTABLE').length, HIGH: DATASET.filter(d => d.expectedRisk === 'HIGH').length, LIMITED: DATASET.filter(d => d.expectedRisk === 'LIMITED').length, MINIMAL: DATASET.filter(d => d.expectedRisk === 'MINIMAL').length }, license: 'CC-BY-4.0 (Open for research and benchmarking)', version: '1.0.0', lastUpdated: '2026-03-14' }; }

  benchmark(predictions: { id: number; predicted: string }[]) {
    let correct = 0;
    const results = predictions.map(p => {
      const expected = DATASET.find(d => d.id === p.id);
      if (!expected) return { id: p.id, status: 'NOT_FOUND' };
      const match = expected.expectedRisk === p.predicted;
      if (match) correct++;
      return { id: p.id, predicted: p.predicted, expected: expected.expectedRisk, correct: match };
    });
    return { accuracy: predictions.length > 0 ? Math.round(correct / predictions.length * 100) : 0, correct, total: predictions.length, results };
  }
}

@Controller('validation')
export class ValidationController {
  constructor(private s: ValidationService) {}
  @Get('dataset') @ApiOperation({ summary: 'Public: 50-system validation dataset (CC-BY-4.0)' }) dataset() { return this.s.getDataset(); }
  @Post('benchmark') @ApiOperation({ summary: 'Benchmark predictions against ground truth' }) benchmark(@Body() body: { predictions: { id: number; predicted: string }[] }) { return this.s.benchmark(body.predictions); }
}

@Module({ controllers: [ValidationController], providers: [ValidationService], exports: [ValidationService] })
export class ValidationModule {}

// F1 score and detailed classification metrics
export function calculateMetrics(predictions: { predicted: string; expected: string }[]): {
  accuracy: number; f1Macro: number; perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
} {
  const classes = ['UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL'];
  const perClass: Record<string, { tp: number; fp: number; fn: number; support: number }> = {};
  classes.forEach(c => { perClass[c] = { tp: 0, fp: 0, fn: 0, support: 0 }; });

  for (const p of predictions) {
    if (perClass[p.expected]) perClass[p.expected].support++;
    if (p.predicted === p.expected) {
      if (perClass[p.predicted]) perClass[p.predicted].tp++;
    } else {
      if (perClass[p.predicted]) perClass[p.predicted].fp++;
      if (perClass[p.expected]) perClass[p.expected].fn++;
    }
  }

  const result: Record<string, { precision: number; recall: number; f1: number; support: number }> = {};
  let f1Sum = 0;
  let classCount = 0;
  for (const c of classes) {
    const { tp, fp, fn, support } = perClass[c];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    result[c] = { precision: Math.round(precision * 100) / 100, recall: Math.round(recall * 100) / 100, f1: Math.round(f1 * 100) / 100, support };
    if (support > 0) { f1Sum += f1; classCount++; }
  }

  const correct = predictions.filter(p => p.predicted === p.expected).length;
  return {
    accuracy: predictions.length > 0 ? Math.round(correct / predictions.length * 100) : 0,
    f1Macro: classCount > 0 ? Math.round(f1Sum / classCount * 100) / 100 : 0,
    perClass: result,
  };
}

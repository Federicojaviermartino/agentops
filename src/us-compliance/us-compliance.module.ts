import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/index';

const US_FRAMEWORKS = [
  {
    id: 'nist-ai-rmf', name: 'NIST AI Risk Management Framework', type: 'FEDERAL_FRAMEWORK', status: 'ACTIVE',
    version: '1.0 (January 2023)', authority: 'NIST (National Institute of Standards and Technology)',
    mandatory: false, description: 'Voluntary framework for managing AI risks. Four core functions: Govern, Map, Measure, Manage. Widely adopted as best practice.',
    functions: [
      { name: 'GOVERN', description: 'Policies, processes, procedures, and practices for AI risk management across the organization', subcategories: 6 },
      { name: 'MAP', description: 'Context established, AI categorized, and AI risks and benefits identified', subcategories: 5 },
      { name: 'MEASURE', description: 'AI risks assessed, analyzed, and tracked using quantitative and qualitative methods', subcategories: 4 },
      { name: 'MANAGE', description: 'AI risks prioritized, responded to, and resources allocated', subcategories: 4 },
    ],
    euAiActMapping: [
      { nist: 'GOVERN 1', euAiAct: 'Art. 9 (Risk Management System)', overlap: 'HIGH' },
      { nist: 'MAP 1-2', euAiAct: 'Art. 6 + Annex III (Classification)', overlap: 'HIGH' },
      { nist: 'MAP 3', euAiAct: 'Art. 10 (Data Governance)', overlap: 'MEDIUM' },
      { nist: 'MEASURE 1-2', euAiAct: 'Art. 15 (Accuracy, Robustness)', overlap: 'HIGH' },
      { nist: 'MEASURE 3', euAiAct: 'Art. 72 (Post-Market Monitoring)', overlap: 'MEDIUM' },
      { nist: 'MANAGE 1-2', euAiAct: 'Art. 14 (Human Oversight)', overlap: 'HIGH' },
      { nist: 'MANAGE 3-4', euAiAct: 'Art. 73 (Incident Reporting)', overlap: 'MEDIUM' },
    ],
  },
  {
    id: 'colorado-ai-act', name: 'Colorado AI Act (SB 24-205)', type: 'STATE_LAW', status: 'ACTIVE',
    version: 'Effective February 1, 2026', authority: 'Colorado Attorney General',
    mandatory: true, description: 'First comprehensive US state AI law. Requires developers and deployers of high-risk AI to avoid algorithmic discrimination. Applies to consequential decisions in education, employment, financial, healthcare, housing, insurance, and legal services.',
    requirements: [
      'Risk management policy and program',
      'Annual impact assessment for high-risk AI',
      'Notify consumers about AI use in consequential decisions',
      'Provide consumers ability to opt out or appeal',
      'Report discovered algorithmic discrimination to AG within 90 days',
      'Developer must provide deployers with documentation',
    ],
    penalties: 'Enforcement by AG. Violations treated as deceptive trade practices. Up to $20,000 per violation.',
    euAiActMapping: [
      { colorado: 'Risk management policy', euAiAct: 'Art. 9', overlap: 'HIGH' },
      { colorado: 'Impact assessment', euAiAct: 'Art. 27 (FRIA)', overlap: 'HIGH' },
      { colorado: 'Consumer notification', euAiAct: 'Art. 13 + Art. 50', overlap: 'HIGH' },
      { colorado: 'Discrimination reporting', euAiAct: 'Art. 73 (Incident reporting)', overlap: 'MEDIUM' },
    ],
  },
  {
    id: 'nyc-ll144', name: 'NYC Local Law 144', type: 'CITY_LAW', status: 'ACTIVE',
    version: 'Effective July 5, 2023', authority: 'NYC Department of Consumer and Worker Protection',
    mandatory: true, description: 'Regulates automated employment decision tools (AEDTs) used in hiring and promotion in NYC. Requires annual bias audits and public disclosure.',
    requirements: [
      'Annual independent bias audit of AEDT',
      'Publish audit results on company website',
      'Notify candidates 10+ business days before AEDT use',
      'Allow candidates to request alternative selection process',
      'Audit must analyze impact ratios by sex, race/ethnicity, and intersectional categories',
    ],
    penalties: '$500 first violation, $500-$1,500 each subsequent violation per day.',
    euAiActMapping: [
      { nyc: 'Bias audit', euAiAct: 'Art. 10 (Data Governance) + Bias Detection', overlap: 'HIGH' },
      { nyc: 'Candidate notification', euAiAct: 'Art. 50 (Transparency)', overlap: 'HIGH' },
      { nyc: 'Audit publication', euAiAct: 'Art. 13 (Transparency)', overlap: 'MEDIUM' },
    ],
  },
  {
    id: 'illinois-bipa', name: 'Illinois Biometric Information Privacy Act', type: 'STATE_LAW', status: 'ACTIVE',
    version: 'Effective 2008, frequently litigated', authority: 'Illinois Courts (private right of action)',
    mandatory: true, description: 'Regulates collection and use of biometric identifiers (fingerprint, face geometry, iris scan, voiceprint). Private right of action enables class action lawsuits.',
    requirements: [
      'Written informed consent before biometric data collection',
      'Published retention and destruction policy',
      'No sale, lease, or trade of biometric data',
      'Reasonable security measures for stored biometric data',
      'Destroy biometric data when purpose fulfilled or within 3 years of last interaction',
    ],
    penalties: '$1,000 per negligent violation, $5,000 per intentional violation. Private right of action (class actions common).',
    euAiActMapping: [
      { illinois: 'Biometric consent', euAiAct: 'Art. 5(1)(d) (Biometric ID prohibition)', overlap: 'HIGH' },
      { illinois: 'Retention policy', euAiAct: 'Art. 10 (Data Governance)', overlap: 'MEDIUM' },
    ],
  },
  {
    id: 'california-ai', name: 'California AI Transparency Act (AB 2885 + SB 942)', type: 'STATE_LAW', status: 'ACTIVE',
    version: 'Various effective dates 2024-2026', authority: 'California AG + CPPA',
    mandatory: true, description: 'Multiple AI-related laws: AI transparency for government use, GPAI watermarking requirements, CCPA AI-related amendments. CalPAI proposes broader AI regulation.',
    requirements: [
      'AI-generated content disclosure (SB 942)',
      'Government AI use transparency',
      'CCPA: right to opt out of AI-based profiling',
      'Deepfake labelling requirements',
      'AI watermarking for GPAI outputs',
    ],
    penalties: 'Varies by specific statute. CCPA: $2,500-$7,500 per violation.',
    euAiActMapping: [
      { california: 'AI content disclosure', euAiAct: 'Art. 50 (Transparency)', overlap: 'HIGH' },
      { california: 'Deepfake labelling', euAiAct: 'Art. 50(4)', overlap: 'HIGH' },
      { california: 'AI watermarking', euAiAct: 'Art. 50 + GPAI Code of Practice', overlap: 'HIGH' },
    ],
  },
  {
    id: 'iso-42001', name: 'ISO/IEC 42001:2023', type: 'INTERNATIONAL_STANDARD', status: 'ACTIVE',
    version: '2023', authority: 'ISO/IEC',
    mandatory: false, description: 'International standard for AI management systems. Specifies requirements for establishing, implementing, maintaining, and improving an AI management system.',
    requirements: [
      'AI policy aligned with organizational strategy',
      'AI risk assessment and treatment',
      'AI system lifecycle management',
      'Data management for AI',
      'Performance evaluation and improvement',
      'Third-party AI system management',
    ],
    penalties: 'N/A (voluntary standard). Certification demonstrates responsible AI commitment.',
    euAiActMapping: [
      { iso: 'AI risk assessment', euAiAct: 'Art. 9 (Risk Management)', overlap: 'HIGH' },
      { iso: 'AI lifecycle', euAiAct: 'Art. 72 (Post-Market Monitoring)', overlap: 'HIGH' },
      { iso: 'Data management', euAiAct: 'Art. 10 (Data Governance)', overlap: 'HIGH' },
      { iso: 'Third-party management', euAiAct: 'Art. 26 (Deployer obligations)', overlap: 'MEDIUM' },
    ],
  },
];

@Injectable()
export class UsComplianceService {
  getAll() { return { frameworks: US_FRAMEWORKS.map(f => ({ id: f.id, name: f.name, type: f.type, status: f.status, mandatory: f.mandatory })), total: US_FRAMEWORKS.length, mandatory: US_FRAMEWORKS.filter(f => f.mandatory).length, stateLaws: US_FRAMEWORKS.filter(f => f.type === 'STATE_LAW').length }; }
  getById(id: string) { return US_FRAMEWORKS.find(f => f.id === id) || null; }
  getCrossMap() {
    const mappings = US_FRAMEWORKS.flatMap(f => (f.euAiActMapping || []).map((m: any) => ({ framework: f.name, ...m })));
    return { totalMappings: mappings.length, highOverlap: mappings.filter(m => m.overlap === 'HIGH').length, mappings };
  }
  getApplicable(params: { state?: string; sector?: string; usesbiometric?: boolean }) {
    let applicable = [...US_FRAMEWORKS.filter(f => f.type === 'FEDERAL_FRAMEWORK' || f.type === 'INTERNATIONAL_STANDARD')];
    if (params.state === 'CO' || params.state === 'colorado') applicable.push(US_FRAMEWORKS.find(f => f.id === 'colorado-ai-act')!);
    if (params.state === 'NY' || params.state === 'nyc') applicable.push(US_FRAMEWORKS.find(f => f.id === 'nyc-ll144')!);
    if (params.state === 'IL' || params.state === 'illinois' || params.usesbiometric) applicable.push(US_FRAMEWORKS.find(f => f.id === 'illinois-bipa')!);
    if (params.state === 'CA' || params.state === 'california') applicable.push(US_FRAMEWORKS.find(f => f.id === 'california-ai')!);
    return applicable.filter(Boolean);
  }
}

@Controller('us-compliance')
export class UsComplianceController {
  constructor(private s: UsComplianceService) {}
  @Get() @ApiOperation({ summary: 'All US AI frameworks and state laws' }) all() { return this.s.getAll(); }
  @Get('cross-map') @ApiOperation({ summary: 'EU AI Act <-> US frameworks cross-mapping' }) crossMap() { return this.s.getCrossMap(); }
  @Get('framework/:id') @ApiOperation({ summary: 'Specific framework details' }) byId(@Param('id') id: string) { return this.s.getById(id); }
  @Get('applicable') @ApiOperation({ summary: 'Frameworks applicable by state/sector/biometric use' }) applicable(@Param('state') st: string) { return this.s.getApplicable({ state: st }); }
}

@Module({ controllers: [UsComplianceController], providers: [UsComplianceService], exports: [UsComplianceService] })
export class UsComplianceModule {}

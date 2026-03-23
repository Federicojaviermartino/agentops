const PARTNER_TIERS = [
  { tier: 'REFERRAL', commission: '15%' },
  { tier: 'SILVER', commission: '20%' },
  { tier: 'GOLD', commission: '25%' },
  { tier: 'PLATINUM', commission: '30%+' },
];
const PARTNER_USE_CASES = [
  { type: 'CONSULTANCY', example: 'Deloitte, McKinsey', useCase: 'White-label compliance platform', avgDealSize: '10K-200K EUR' },
  { type: 'LAW_FIRM', example: 'DLA Piper, CMS', useCase: 'Automated compliance documentation', avgDealSize: '5K-50K EUR' },
  { type: 'SYSTEM_INTEGRATOR', example: 'Capgemini, Atos', useCase: 'Compliance-as-a-service', avgDealSize: '20K-500K EUR' },
  { type: 'AUDITOR', example: 'TUV, BSI', useCase: 'Pre-audit compliance data', avgDealSize: '10K-100K EUR' },
];
const CERTIFICATIONS = [
  { id: 'soc2-type2', name: 'SOC 2 Type II', category: 'SECURITY', estimatedCost: '8K-15K USD', timeline: '3-6 months' },
  { id: 'iso-27001', name: 'ISO 27001:2022', category: 'SECURITY', estimatedCost: '10K-25K USD', timeline: '4-9 months' },
  { id: 'iso-42001', name: 'ISO/IEC 42001:2023', category: 'AI_GOVERNANCE', estimatedCost: '15K-40K USD', timeline: '6-12 months' },
  { id: 'gdpr', name: 'GDPR Compliance', category: 'PRIVACY', estimatedCost: '5K-20K USD', timeline: '2-6 months' },
  { id: 'ce-marking', name: 'CE Marking (AI Act)', category: 'REGULATORY', estimatedCost: '5K-50K USD', timeline: '2-6 months' },
];

import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { JwtAuthGuard, CurrentUser } from '../common/index';

class PartnerApplicationDto {
  @IsString() companyName: string;
  @IsString() contactName: string;
  @IsEmail() email: string;
  @IsString() type: string; // CONSULTANCY | LAW_FIRM | SYSTEM_INTEGRATOR | AUDITOR
  @IsString() @IsOptional() country?: string;
  @IsString() @IsOptional() clientCount?: string;
  @IsString() @IsOptional() message?: string;
}

// ============================================================
// PARTNER PROGRAM (consultancies, law firms, Big4)
// ============================================================

@Injectable()
export class PartnersService {
  private applications: any[] = []; // TODO: Persist to DB in production
  getProgram() { return { tiers: PARTNER_TIERS, useCases: PARTNER_USE_CASES, totalApplications: this.applications.length }; }
  apply(dto: PartnerApplicationDto) {
    const app = { ...dto, id: `PA-${Date.now()}`, status: 'PENDING', appliedAt: new Date().toISOString() };
    this.applications.push(app);
    return { application: app, nextSteps: ['Application received. We will review within 48 hours.', 'A partner manager will schedule a call to discuss the program.', 'Once approved, you will receive API access and co-branding materials.'] };
  }
  getCertifications() { return { certifications: CERTIFICATIONS, recommended: CERTIFICATIONS.filter(c => ['soc2-type2', 'iso-42001'].includes(c.id)), totalEstimatedCost: '43,000-150,000 USD', totalTimeline: '6-18 months (parallel execution recommended)' }; }
  getCertificationRoadmap() {
    return { phases: [
      { phase: 1, title: 'Foundation (Months 1-3)', items: ['GDPR compliance verification', 'SOC 2 Type II preparation (start evidence collection)', 'ISO 42001 gap analysis'] },
      { phase: 2, title: 'Core Certifications (Months 3-6)', items: ['SOC 2 Type II audit period begins', 'ISO 27001 implementation', 'CE marking preparation for high-risk AI'] },
      { phase: 3, title: 'Advanced (Months 6-12)', items: ['ISO 42001 certification', 'SOC 2 Type II report issued', 'ISO 27001 certification audit'] },
    ] };
  }
}

@Controller('partners')
export class PartnersController {
  constructor(private s: PartnersService) {}
  @Get() @ApiOperation({ summary: 'Partner program details (tiers, use cases)' }) program() { return this.s.getProgram(); }
  @Post('apply') @ApiOperation({ summary: 'Apply to partner program' }) apply(@Body() dto: PartnerApplicationDto) { return this.s.apply(dto); }
  @Get('certifications') @ApiOperation({ summary: 'Certification readiness tracker' }) certs() { return this.s.getCertifications(); }
  @Get('certifications/roadmap') @ApiOperation({ summary: 'Recommended certification roadmap' }) roadmap() { return this.s.getCertificationRoadmap(); }
}

@Module({ controllers: [PartnersController], providers: [PartnersService], exports: [PartnersService] })
export class PartnersModule {}

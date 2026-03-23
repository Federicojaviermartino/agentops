import { Controller, Get, Injectable, Module, Param, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '../common/index';

// Real data from EU AI Act Art. 99 + national implementations as of March 2026
const EU_PENALTIES = {
  maxProhibited: { eur: 35_000_000, pctRevenue: 7, description: 'Prohibited AI practices (Art. 5)' },
  maxHighRisk: { eur: 15_000_000, pctRevenue: 3, description: 'High-risk system non-compliance (Art. 8-15)' },
  maxInfo: { eur: 7_500_000, pctRevenue: 1, description: 'Incorrect information to authorities' },
  smeRule: 'For SMEs/startups: the LOWER of absolute amount or percentage applies',
};

interface CountryPenalty {
  code: string; name: string; localName: string;
  nationalLaw: string | null; lawStatus: 'ENACTED' | 'DRAFT' | 'PENDING';
  criminalLiability: boolean; criminalDetail: string | null;
  supervisoryAuthority: string; authorityUrl: string | null;
  sandboxStatus: 'OPERATIONAL' | 'PLANNED' | 'UNKNOWN';
  sandboxDeadline: string;
  additionalPenalties: string[];
  notes: string;
}

const COUNTRIES: CountryPenalty[] = [
  { code: 'IT', name: 'Italy', localName: 'Italia', nationalLaw: 'Law No. 132/2025', lawStatus: 'ENACTED', criminalLiability: true, criminalDetail: 'Imprisonment 1-5 years for unlawful deepfake dissemination. Disqualification from business up to 1 year. Fines up to EUR 774,685.', supervisoryAuthority: 'AgID + Garante Privacy', authorityUrl: 'https://www.agid.gov.it', sandboxStatus: 'OPERATIONAL', sandboxDeadline: '2026-08-02', additionalPenalties: ['Business disqualification up to 1 year', 'Revocation of licenses/concessions', 'Ban on public procurement', 'Exclusion from grants/subsidies', 'Advertising prohibition'], notes: 'Most advanced national implementation. Criminal aggravating circumstance for AI-assisted crimes.' },
  { code: 'DE', name: 'Germany', localName: 'Deutschland', nationalLaw: 'KI-Verordnungs-Durchfuehrungsgesetz (draft)', lawStatus: 'DRAFT', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'BNetzA (Bundesnetzagentur)', authorityUrl: 'https://www.bundesnetzagentur.de', sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: ['Administrative fines per EU AI Act maximums'], notes: 'BNetzA designated as market surveillance authority. Sandbox planned via BNetzA coordination.' },
  { code: 'FR', name: 'France', localName: 'France', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'CNIL + DGE', authorityUrl: 'https://www.cnil.fr', sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: ['CNIL enforcement powers (GDPR model)'], notes: 'CNIL expected to lead enforcement. Strong existing GDPR enforcement precedent.' },
  { code: 'ES', name: 'Spain', localName: 'Espana', nationalLaw: 'Real Decreto (draft)', lawStatus: 'DRAFT', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'AESIA (Agencia Espanola de Supervision de IA)', authorityUrl: 'https://www.aesia.gob.es', sandboxStatus: 'OPERATIONAL', sandboxDeadline: '2026-08-02', additionalPenalties: ['AESIA administrative sanctions'], notes: 'Spain was first EU country to create a dedicated AI supervisory authority (AESIA). Sandbox already operational since 2024.' },
  { code: 'NL', name: 'Netherlands', localName: 'Nederland', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'Autoriteit Persoonsgegevens + RDI', authorityUrl: 'https://www.autoriteitpersoonsgegevens.nl', sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: ['AP enforcement powers'], notes: 'Algorithm register for government AI already operational. Strong transparency culture.' },
  { code: 'AT', name: 'Austria', localName: 'Osterreich', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'BMK (Bundesministerium)', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'RTR designated as coordinating authority.' },
  { code: 'BE', name: 'Belgium', localName: 'Belgique', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'FPS Economy', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Federal structure may split oversight across regions.' },
  { code: 'PT', name: 'Portugal', localName: 'Portugal', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'CNPD + ANACOM', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'CNPD (data protection) expected to co-lead enforcement.' },
  { code: 'IE', name: 'Ireland', localName: 'Eire', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'DPC + CCPC', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Critical for Big Tech HQs (Google, Meta, Apple EU operations).' },
  { code: 'PL', name: 'Poland', localName: 'Polska', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'UODO + UKE', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Growing AI ecosystem in Warsaw/Krakow.' },
  { code: 'CZ', name: 'Czech Republic', localName: 'Cesko', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'CTU', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Prague emerging as AI hub.' },
  { code: 'RO', name: 'Romania', localName: 'Romania', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'ANCOM', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Strong IT outsourcing sector affected.' },
  { code: 'HU', name: 'Hungary', localName: 'Magyarorszag', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'NMHH', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'SE', name: 'Sweden', localName: 'Sverige', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'IMY', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'IMY (data protection) expected to lead.' },
  { code: 'DK', name: 'Denmark', localName: 'Danmark', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'Datatilsynet', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'FI', name: 'Finland', localName: 'Suomi', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'Traficom', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Strong digital governance culture.' },
  { code: 'EL', name: 'Greece', localName: 'Ellada', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'EETT', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'BG', name: 'Bulgaria', localName: 'Balgariya', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'CRC', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'HR', name: 'Croatia', localName: 'Hrvatska', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'HAKOM', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'SK', name: 'Slovakia', localName: 'Slovensko', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'RU', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Digital Applied providing local guidance.' },
  { code: 'SI', name: 'Slovenia', localName: 'Slovenija', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'AKOS', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'LT', name: 'Lithuania', localName: 'Lietuva', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'RRT', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Vilnius fintech hub affected.' },
  { code: 'LV', name: 'Latvia', localName: 'Latvija', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'SPRK', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'EE', name: 'Estonia', localName: 'Eesti', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'TTJA', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Most digitized government in EU. Strong e-governance.' },
  { code: 'CY', name: 'Cyprus', localName: 'Kypros', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'OCECPR', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: '' },
  { code: 'LU', name: 'Luxembourg', localName: 'Letzebuerg', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'ILR', authorityUrl: null, sandboxStatus: 'PLANNED', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'EU institutions HQ. Many AI companies registered here.' },
  { code: 'MT', name: 'Malta', localName: 'Malta', nationalLaw: null, lawStatus: 'PENDING', criminalLiability: false, criminalDetail: null, supervisoryAuthority: 'MCA', authorityUrl: null, sandboxStatus: 'UNKNOWN', sandboxDeadline: '2026-08-02', additionalPenalties: [], notes: 'Early AI strategy adopter (MDIA 2018).' },
];

@Injectable()
export class PenaltiesService {
  getAll() { return { euMaximums: EU_PENALTIES, countries: COUNTRIES, totalCountries: COUNTRIES.length, enacted: COUNTRIES.filter(c => c.lawStatus === 'ENACTED').length, draft: COUNTRIES.filter(c => c.lawStatus === 'DRAFT').length, pending: COUNTRIES.filter(c => c.lawStatus === 'PENDING').length, sandboxesOperational: COUNTRIES.filter(c => c.sandboxStatus === 'OPERATIONAL').length, criminalLiabilityCountries: COUNTRIES.filter(c => c.criminalLiability).map(c => c.name) }; }

  getByCountry(code: string) {
    const country = COUNTRIES.find(c => c.code === code.toUpperCase());
    if (!country) return null;
    const dl = new Date('2026-08-02');
    const daysLeft = Math.ceil((dl.getTime() - Date.now()) / 86400000);
    return { ...country, euMaximums: EU_PENALTIES, daysUntilEnforcement: daysLeft, urgencyLevel: daysLeft < 90 ? 'CRITICAL' : daysLeft < 180 ? 'HIGH' : 'MEDIUM' };
  }

  calculatePenalty(annualRevenue: number, violationType: 'PROHIBITED' | 'HIGH_RISK' | 'INFO', isSme: boolean) {
    const tiers = { PROHIBITED: { pct: 7, abs: 35_000_000 }, HIGH_RISK: { pct: 3, abs: 15_000_000 }, INFO: { pct: 1, abs: 7_500_000 } };
    const tier = tiers[violationType];
    const pctAmount = annualRevenue * (tier.pct / 100);
    const absAmount = tier.abs;
    const maxFine = isSme ? Math.min(pctAmount, absAmount) : Math.max(pctAmount, absAmount);
    return { violationType, annualRevenue, isSme, percentageAmount: Math.round(pctAmount), absoluteAmount: absAmount, applicableFine: Math.round(maxFine), rule: isSme ? 'SME rule: LOWER of percentage or absolute (Art. 99(5))' : 'Standard rule: HIGHER of percentage or absolute' };
  }

  getSandboxes() { return COUNTRIES.filter(c => c.sandboxStatus === 'OPERATIONAL').map(c => ({ country: c.name, code: c.code, authority: c.supervisoryAuthority, url: c.authorityUrl, notes: c.notes })); }
}

@Controller('penalties')
export class PenaltiesController {
  constructor(private s: PenaltiesService) {}
  @Get() @ApiOperation({ summary: 'All 27 EU countries penalty data' }) all() { return this.s.getAll(); }
  @Get('country/:code') @ApiOperation({ summary: 'Penalty data for specific country' }) country(@Param('code') code: string) { return this.s.getByCountry(code); }
  @Get('calculate') @ApiOperation({ summary: 'Calculate potential fine' }) calc(@Query('revenue') rev: string, @Query('type') type: string, @Query('sme') sme: string) { return this.s.calculatePenalty(+rev || 0, (type || 'HIGH_RISK') as any, sme === 'true'); }
  @Get('sandboxes') @ApiOperation({ summary: 'Active regulatory sandboxes' }) sandboxes() { return this.s.getSandboxes(); }
}

@Module({ controllers: [PenaltiesController], providers: [PenaltiesService], exports: [PenaltiesService] })
export class PenaltiesModule {}

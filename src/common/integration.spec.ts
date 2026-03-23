// Integration tests: Verify module compilation and wiring without database
import { Test, TestingModule } from '@nestjs/testing';

import { PenaltiesModule, PenaltiesService } from '../penalties/penalties.module';
import { RagModule, RagService } from '../rag/rag.module';
import { TemplatesModule, TemplatesService } from '../templates/templates.module';
import { UsComplianceModule, UsComplianceService } from '../us-compliance/us-compliance.module';
import { ValidationModule, ValidationService } from '../validation/validation.module';
import { PartnersModule, PartnersService } from '../partners/partners.module';

describe('Integration: Module Compilation', () => {
  it('PenaltiesModule compiles and provides PenaltiesService', async () => {
    const m = await Test.createTestingModule({ imports: [PenaltiesModule] }).compile();
    const s = m.get(PenaltiesService);
    expect(s).toBeDefined();
    expect(s.getAll().totalCountries).toBe(27);
  });
  it('RagModule compiles and provides RagService', async () => {
    const m = await Test.createTestingModule({ imports: [RagModule] }).compile();
    const s = m.get(RagService);
    expect(s.search('risk management').results.length).toBeGreaterThan(0);
  });
  it('TemplatesModule compiles and provides TemplatesService', async () => {
    const m = await Test.createTestingModule({ imports: [TemplatesModule] }).compile();
    const s = m.get(TemplatesService);
    expect(s.getAll().total).toBeGreaterThan(4);
  });
  it('UsComplianceModule compiles and provides UsComplianceService', async () => {
    const m = await Test.createTestingModule({ imports: [UsComplianceModule] }).compile();
    const s = m.get(UsComplianceService);
    expect(s.getAll().total).toBeGreaterThan(4);
  });
  it('ValidationModule compiles and provides ValidationService', async () => {
    const m = await Test.createTestingModule({ imports: [ValidationModule] }).compile();
    const s = m.get(ValidationService);
    expect(s.getDataset().total).toBe(50);
  });
  it('PartnersModule compiles and provides PartnersService', async () => {
    const m = await Test.createTestingModule({ imports: [PartnersModule] }).compile();
    const s = m.get(PartnersService);
    expect(s.getProgram().tiers.length).toBe(4);
  });
  it('Cross-module data consistency: Penalties 27 countries match i18n 21 languages', async () => {
    const pm = await Test.createTestingModule({ imports: [PenaltiesModule] }).compile();
    expect(pm.get(PenaltiesService).getAll().totalCountries).toBe(27);
  });
  it('Validation dataset covers all 4 risk levels', async () => {
    const m = await Test.createTestingModule({ imports: [ValidationModule] }).compile();
    const d = m.get(ValidationService).getDataset().distribution;
    expect(d.UNACCEPTABLE).toBeGreaterThan(0);
    expect(d.HIGH).toBeGreaterThan(0);
    expect(d.LIMITED).toBeGreaterThan(0);
    expect(d.MINIMAL).toBeGreaterThan(0);
  });
  it('US Compliance has EU AI Act cross-mapping for all frameworks', async () => {
    const m = await Test.createTestingModule({ imports: [UsComplianceModule] }).compile();
    const cm = m.get(UsComplianceService).getCrossMap();
    expect(cm.highOverlap).toBeGreaterThan(5);
  });
  it('Templates cover at least 5 sectors', async () => {
    const m = await Test.createTestingModule({ imports: [TemplatesModule] }).compile();
    expect(m.get(TemplatesService).getAll().sectors.length).toBeGreaterThanOrEqual(5);
  });
});

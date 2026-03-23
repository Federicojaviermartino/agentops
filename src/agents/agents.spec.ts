import { ClassificationAgentService, AiProviderService } from './agents.module';

describe('ClassificationAgentService', () => {
  let service: ClassificationAgentService;
  let mockAi: any;

  beforeEach(() => {
    mockAi = { complete: jest.fn().mockResolvedValue({ content: JSON.stringify({ riskLevel: 'MINIMAL', confidence: 0.5, reasoning: 'Default', articleReferences: [], annexReferences: [], obligations: [] }), tokensUsed: 100 }) };
    service = new ClassificationAgentService(mockAi);
  });

  const classify = (purpose: string) => service.classify({ systemDescription: 'Test', purpose, sector: '', dataTypes: [], deploymentContext: '', affectedPopulation: '' });

  describe('Heuristic overrides', () => {
    it('hiring -> HIGH', async () => { const r = await classify('CV screening and hiring decisions'); expect(r.riskLevel).toBe('HIGH'); expect(r.reasoning).toContain('Annex III, domain 4'); });
    it('credit scoring -> HIGH', async () => { const r = await classify('Credit scoring for loan approval'); expect(r.riskLevel).toBe('HIGH'); expect(r.reasoning).toContain('Annex III, domain 5'); });
    it('education grading -> HIGH', async () => { const r = await classify('Student exam scoring system'); expect(r.riskLevel).toBe('HIGH'); expect(r.reasoning).toContain('Annex III, domain 3'); });
    it('biometric -> HIGH', async () => { const r = await classify('Facial recognition for access'); expect(r.riskLevel).toBe('HIGH'); expect(r.reasoning).toContain('Annex III, domain 1'); });
    it('chatbot -> LIMITED', async () => { const r = await classify('Customer support chatbot'); expect(r.riskLevel).toBe('LIMITED'); expect(r.reasoning).toContain('Art. 50'); });
    it('generative AI -> LIMITED', async () => { const r = await classify('Generative AI for content creation'); expect(r.riskLevel).toBe('LIMITED'); });
    it('social scoring -> UNACCEPTABLE', async () => { const r = await classify('Social scoring of citizens'); expect(r.riskLevel).toBe('UNACCEPTABLE'); expect(r.reasoning).toContain('Art. 5'); });
    it('subliminal manipulation -> UNACCEPTABLE', async () => { const r = await classify('Subliminal manipulation techniques'); expect(r.riskLevel).toBe('UNACCEPTABLE'); });
  });

  describe('LLM fallback', () => {
    it('should use LLM when no heuristic matches', async () => {
      const r = await classify('Product recommendation engine');
      expect(r.riskLevel).toBe('MINIMAL');
      expect(mockAi.complete).toHaveBeenCalledTimes(3); // Self-consistency: 3 runs
    });

    it('should handle LLM parse errors', async () => {
      mockAi.complete.mockResolvedValue({ content: 'not json', tokensUsed: 50 });
      const r = await classify('Some system');
      expect(r.riskLevel).toBe('MINIMAL');
      expect(r.confidence).toBe(0.3);
    });

    it('should handle LLM with markdown fences', async () => {
      mockAi.complete.mockResolvedValue({ content: '```json\n{"riskLevel":"HIGH","confidence":0.9,"reasoning":"test","articleReferences":[],"annexReferences":[],"obligations":[]}\n```', tokensUsed: 200 });
      const r = await classify('Some system');
      expect(r.riskLevel).toBe('HIGH');
      expect(r.confidence).toBe(0.9);
    });
  });

  describe('Heuristic vs LLM priority', () => {
    it('should override LLM MINIMAL with heuristic HIGH for hiring', async () => {
      mockAi.complete.mockResolvedValue({ content: JSON.stringify({ riskLevel: 'MINIMAL', confidence: 0.8, reasoning: 'Low risk', articleReferences: [], annexReferences: [], obligations: [] }), tokensUsed: 100 });
      const r = await classify('Resume screening tool for hiring');
      expect(r.riskLevel).toBe('HIGH');
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should NOT downgrade LLM UNACCEPTABLE with heuristic HIGH', async () => {
      mockAi.complete.mockResolvedValue({ content: JSON.stringify({ riskLevel: 'UNACCEPTABLE', confidence: 0.95, reasoning: 'Prohibited', articleReferences: ['Art. 5'], annexReferences: [], obligations: [] }), tokensUsed: 100 });
      const r = await classify('Hiring tool with facial recognition');
      expect(r.riskLevel).toBe('UNACCEPTABLE');
    });
  });
});

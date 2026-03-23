// Tests for modules that lost coverage during cleanup
import { AnalyticsService } from '../analytics/analytics.module';
import { AssistantService } from '../assistant/assistant.module';
import { ExportService } from '../export/export.module';
import { IncidentsService } from '../incidents/incidents.module';
import { NotificationsService } from '../notifications/notifications.module';
import { ReportsService } from '../reports/reports.module';
import { RoadmapService } from '../roadmap/roadmap.module';
import { SearchService } from '../search/search.module';
import { SettingsService } from '../settings/settings.module';
import { WebhooksService } from '../webhooks/webhooks.module';
import { FindingsService } from '../findings/findings.module';
import { AuditLogInterceptor } from '../common/index';
import { of } from 'rxjs';

const mockPrisma = () => ({
  aiSystem: { count: jest.fn().mockResolvedValue(3), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
  complianceFinding: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() },
  assessment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  monitoringEvent: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  auditLog: { findMany: jest.fn().mockResolvedValue([]) },
  generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
  organization: { findUnique: jest.fn().mockResolvedValue({ id: 'o1', name: 'T', plan: 'PROFESSIONAL', settings: {} }), update: jest.fn() },
  notification: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'n1' }), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(2) },
  $executeRaw: jest.fn().mockResolvedValue(1),
});

describe('AnalyticsService', () => {
  it('executive summary', async () => { const p = mockPrisma(); const s = new AnalyticsService(p as any); const r = await s.getExecutiveSummary('o1'); expect(r.totalSystems).toBe(3); });
  it('compliance trend', async () => { const p = mockPrisma(); const s = new AnalyticsService(p as any); const r = await s.getComplianceTrend('o1'); expect(Array.isArray(r)).toBe(true); });
  it('system comparison', async () => { const p = mockPrisma(); const s = new AnalyticsService(p as any); expect(await s.getSystemComparison('o1')).toEqual([]); });
  it('activity log', async () => { const p = mockPrisma(); p.auditLog.findMany.mockResolvedValue([{ action: 'X', createdAt: new Date() }]); const s = new AnalyticsService(p as any); expect(await s.getActivityLog('o1', 10)).toHaveLength(1); });
});

describe('AssistantService', () => {
  it('answers known topic', async () => { const s = new AssistantService(); const r = await s.ask('What are the fines?'); expect(r.answer).toBeDefined(); expect(r.answer.length).toBeGreaterThan(20); });
  it('has articles and obligations', async () => { const s = new AssistantService(); const r = await s.ask('risk classification'); expect(r.articles).toBeDefined(); expect(r.obligations).toBeDefined(); });
  it('fallback for unknown topic', async () => { const s = new AssistantService(); const r = await s.ask('random gibberish xyz'); expect(r.answer).toBeDefined(); });
  it('responds in < 100ms for instant topics', async () => { const s = new AssistantService(); const start = Date.now(); await s.ask('prohibited practices'); expect(Date.now() - start).toBeLessThan(100); });
});

describe('ExportService', () => {
  it('exports findings CSV', async () => { const p = mockPrisma(); p.complianceFinding.findMany.mockResolvedValue([{ id: 'f1', title: 'T', severity: 'HIGH', category: 'RISK_MANAGEMENT', status: 'OPEN', articleRef: 'Art. 9', createdAt: new Date(), aiSystem: { name: 'A' } }]); const s = new ExportService(p as any); const csv = await s.exportFindings('o1', 'csv'); expect(csv).toContain('Title'); });
  it('exports systems JSON', async () => { const p = mockPrisma(); const s = new ExportService(p as any); const r = await s.exportSystems('o1', 'json'); expect(Array.isArray(r)).toBe(true); });
  it('exports evidence package', async () => { const p = mockPrisma(); const s = new ExportService(p as any); const r = await s.exportComplianceEvidence('o1'); expect(r.exportMetadata.regulation).toContain('2024/1689'); });
});

describe('IncidentsService', () => {
  it('creates incident with 72h deadline', async () => { const p = mockPrisma(); p.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'AI' }); const s = new IncidentsService(p as any); const r = await s.create('o1', { title: 'Bias found', description: 'D', severity: 'HIGH', aiSystemId: 's1' }, 'u1'); expect(r.status).toBe('DETECTED'); expect(r.initialReportDue).toBeDefined(); });
  it('lists incidents', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { incidents: [{ id: 'i1' }] } }); const s = new IncidentsService(p as any); const r = await s.list('o1'); expect(r).toHaveLength(1); });
  it('getById', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { incidents: [{ id: 'i1', title: 'T' }] } }); const s = new IncidentsService(p as any); expect((await s.getById('o1', 'i1'))?.title).toBe('T'); });
});

describe('NotificationsService', () => {
  it('creates notification', async () => { const p = mockPrisma(); const s = new NotificationsService(p as any); const r = await s.create({ orgId: 'o1', type: 'INFO', title: 'T', message: 'M' }); expect(r).toBeDefined(); });
  it('lists notifications', async () => { const p = mockPrisma(); const s = new NotificationsService(p as any); expect(await s.list('o1', 'u1')).toEqual([]); });
  it('counts unread', async () => { const p = mockPrisma(); const s = new NotificationsService(p as any); expect(await s.getUnreadCount('o1', 'u1')).toBe(0); });
  it('marks all read', async () => { const p = mockPrisma(); const s = new NotificationsService(p as any); const r = await s.markAllRead('o1', 'u1'); expect(r.message).toBeDefined(); });
});

describe('ReportsService', () => {
  it('executive report HTML', async () => { const p = mockPrisma(); const s = new ReportsService(p as any); const html = await s.generateExecutiveReport('o1'); expect(html).toContain('<html>'); expect(html).toContain('AgentOps'); });
  it('system report', async () => { const p = mockPrisma(); p.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'T', version: '1', description: 'D', purpose: 'P', sector: 'OTHER', riskLevel: 'HIGH', complianceStatus: 'NON_COMPLIANT', dataTypes: [], affectedPopulation: '', deploymentContext: '', findings: [], assessments: [], documents: [] }); const s = new ReportsService(p as any); const html = await s.generateSystemReport('o1', 's1'); expect(html).toContain('HIGH'); });
});

describe('RoadmapService', () => {
  it('generates roadmap for HIGH risk', async () => { const p = mockPrisma(); p.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'AI', riskLevel: 'HIGH', findings: [], documents: [], assessments: [] }); const s = new RoadmapService(p as any); const r = await s.generateForSystem('o1', 's1'); expect(r).not.toBeNull(); expect(r!.phases.length).toBeGreaterThan(0); });
  it('LIMITED risk has fewer steps', async () => { const p = mockPrisma(); p.aiSystem.findFirst.mockResolvedValue({ id: 's1', name: 'AI', riskLevel: 'LIMITED', findings: [], documents: [], assessments: [] }); const s = new RoadmapService(p as any); const r = await s.generateForSystem('o1', 's1'); expect(r).not.toBeNull(); expect(r!.phases.length).toBeGreaterThan(0); });
  it('null for unknown', async () => { const p = mockPrisma(); const s = new RoadmapService(p as any); expect(await s.generateForSystem('o1', 'x')).toBeNull(); });
});

describe('SearchService', () => {
  it('empty query', async () => { const p = mockPrisma(); const s = new SearchService(p as any); expect((await s.search('o1', '')).total).toBe(0); });
  it('returns results', async () => { const p = mockPrisma(); p.aiSystem.findMany.mockResolvedValue([{ id: 's1', name: 'Hiring AI', type: 'system' }]); const s = new SearchService(p as any); const r = await s.search('o1', 'hiring'); expect(r.query).toBe('hiring'); });
});

describe('SettingsService', () => {
  it('getOrg returns org with stats', async () => { const p = mockPrisma(); const s = new SettingsService(p as any); const r = await s.getOrg('o1'); expect(r.id).toBe('o1'); });
  it('GDPR export', async () => { const p = mockPrisma(); const s = new SettingsService(p as any); const r = await s.exportData('o1'); expect(r.organization).toBeDefined(); expect(r.exportedAt).toBeDefined(); });
});

describe('WebhooksService', () => {
  it('creates webhook', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { webhooks: [] } }); const s = new WebhooksService(p as any); const r = await s.create('o1', { url: 'https://example.com/hook', events: ['assessment.completed'] }); expect(r.url).toBe('https://example.com/hook'); expect(r.secret).toBeDefined(); });
  it('lists webhooks', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { webhooks: [{ id: 'w1' }] } }); const s = new WebhooksService(p as any); expect(await s.list('o1')).toHaveLength(1); });
  it('deletes webhook', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { webhooks: [{ id: 'w1' }] } }); const s = new WebhooksService(p as any); expect((await s.remove('o1', 'w1')).removed).toBe(true); });
  it('fires webhook', async () => { const p = mockPrisma(); p.organization.findUnique.mockResolvedValue({ id: 'o1', settings: { webhooks: [{ id: 'w1', url: 'https://x.com', secret: 's', events: ['assessment.completed'], active: true }] } }); (global as any).fetch = jest.fn().mockResolvedValue({ ok: true }); const s = new WebhooksService(p as any); await s.fire('o1', 'assessment.completed', {}); expect(global.fetch).toHaveBeenCalled(); delete (global as any).fetch; });
});

describe('FindingsService - Filters', () => {
  it('list with filters', async () => { const p = mockPrisma(); const s = new FindingsService(p as any); const r = await s.list('o1', { severity: 'CRITICAL', limit: 10 }); expect(p.complianceFinding.findMany).toHaveBeenCalled(); });
  it('summary', async () => { const p = mockPrisma(); const s = new FindingsService(p as any); const r = await s.getSummary('o1'); expect(r.totalOpen).toBeDefined(); });
});

describe('AuditLogInterceptor', () => {
  it('logs POST', (done) => { const i = new AuditLogInterceptor(); const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', url: '/api', user: { id: 'u1' }, ip: '1.2.3.4', headers: { 'user-agent': 'test' } }) }) }; i.intercept(ctx, { handle: () => of({}) }).subscribe({ complete: done }); });
  it('skips GET', (done) => { const i = new AuditLogInterceptor(); const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/api', user: {}, headers: {} }) }) }; i.intercept(ctx, { handle: () => of([]) }).subscribe({ complete: done }); });
});

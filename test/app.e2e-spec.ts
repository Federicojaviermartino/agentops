/**
 * E2E Test Suite for AgentOps
 * Tests the full pipeline: register -> login -> create system -> assess -> findings -> docs
 *
 * Run with: npx jest --config test/jest-e2e.json
 * Requires: PostgreSQL running (docker compose up -d)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AgentOps E2E Pipeline', () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let systemId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  // AUTH
  it('POST /auth/register', async () => {
    const r = await request(app.getHttpServer()).post('/auth/register')
      .send({ email: `e2e-${Date.now()}@test.com`, password: 'E2eTest123!', name: 'E2E Tester', organizationName: 'E2E Org' })
      .expect(201);
    expect(r.body.accessToken).toBeDefined();
    expect(r.body.user.role).toBe('OWNER');
    token = r.body.accessToken;
    orgId = r.body.user.organizationId;
  });

  it('POST /auth/login', async () => {
    const r = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: 'admin@techstart.es', password: 'AgentOps2026!' }).expect(200);
    expect(r.body.accessToken).toBeDefined();
    // Use seed user token for rest of tests
    token = r.body.accessToken;
    orgId = r.body.user.organizationId;
  });

  it('GET /auth/me', async () => {
    const r = await request(app.getHttpServer()).get('/auth/me')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.email).toBeDefined();
  });

  it('rejects without token', async () => {
    await request(app.getHttpServer()).get('/ai-systems').expect(401);
  });

  // AI SYSTEMS
  it('POST /ai-systems', async () => {
    const r = await request(app.getHttpServer()).post('/ai-systems')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'E2E Test System', description: 'AI hiring tool for screening CVs',
        purpose: 'CV screening and hiring decisions', sector: 'EMPLOYMENT',
        dataTypes: ['PERSONAL', 'PROFESSIONAL'], affectedPopulation: 'Job applicants',
      }).expect(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.complianceStatus).toBe('NOT_ASSESSED');
    systemId = r.body.id;
  });

  it('GET /ai-systems', async () => {
    const r = await request(app.getHttpServer()).get('/ai-systems')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /ai-systems/:id', async () => {
    const r = await request(app.getHttpServer()).get(`/ai-systems/${systemId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.name).toBe('E2E Test System');
  });

  it('GET /ai-systems/overview', async () => {
    const r = await request(app.getHttpServer()).get('/ai-systems/overview')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.total).toBeGreaterThanOrEqual(1);
    expect(r.body.daysToDeadline).toBeGreaterThan(0);
  });

  it('PATCH /ai-systems/:id', async () => {
    const r = await request(app.getHttpServer()).patch(`/ai-systems/${systemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '2.0' }).expect(200);
    expect(r.body.version).toBe('2.0');
  });

  // ASSESSMENTS
  it('POST /ai-systems/:id/assessments - triggers pipeline', async () => {
    const r = await request(app.getHttpServer()).post(`/ai-systems/${systemId}/assessments`)
      .set('Authorization', `Bearer ${token}`).expect(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.type).toBe('FULL');
  });

  it('GET /ai-systems/:id/assessments', async () => {
    await new Promise(r => setTimeout(r, 2000)); // Wait for async pipeline
    const r = await request(app.getHttpServer()).get(`/ai-systems/${systemId}/assessments`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  // FINDINGS
  it('GET /findings/summary', async () => {
    const r = await request(app.getHttpServer()).get('/findings/summary')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body).toHaveProperty('totalOpen');
    expect(r.body).toHaveProperty('riskScore');
  });

  it('GET /findings', async () => {
    const r = await request(app.getHttpServer()).get('/findings?limit=10')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body).toHaveProperty('items');
    expect(r.body).toHaveProperty('total');
  });

  // DOCUMENTS
  it('GET /documents', async () => {
    const r = await request(app.getHttpServer()).get('/documents')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  // MONITORING
  it('GET /monitoring/events', async () => {
    const r = await request(app.getHttpServer()).get('/monitoring/events')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /monitoring/events/summary', async () => {
    const r = await request(app.getHttpServer()).get('/monitoring/events/summary')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.daysToDeadline).toBeGreaterThan(0);
  });

  // ANALYTICS
  it('GET /analytics/executive-summary', async () => {
    const r = await request(app.getHttpServer()).get('/analytics/executive-summary')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body).toHaveProperty('totalSystems');
    expect(r.body).toHaveProperty('deadline');
    expect(r.body.deadline.daysLeft).toBeGreaterThan(0);
  });

  it('GET /analytics/system-comparison', async () => {
    const r = await request(app.getHttpServer()).get('/analytics/system-comparison')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  // BILLING
  it('GET /billing/status', async () => {
    const r = await request(app.getHttpServer()).get('/billing/status')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body).toHaveProperty('plan');
    expect(r.body).toHaveProperty('systemLimit');
  });

  // SETTINGS
  it('GET /settings/organization', async () => {
    const r = await request(app.getHttpServer()).get('/settings/organization')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.name).toBeDefined();
    expect(r.body.userCount).toBeGreaterThanOrEqual(1);
  });

  it('GET /settings/users', async () => {
    const r = await request(app.getHttpServer()).get('/settings/users')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /settings/profile', async () => {
    const r = await request(app.getHttpServer()).get('/settings/profile')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.email).toBeDefined();
    expect(r.body.organization).toBeDefined();
  });

  // PASSWORD RESET
  it('POST /auth/forgot-password', async () => {
    const r = await request(app.getHttpServer()).post('/auth/forgot-password')
      .send({ email: 'admin@techstart.es' }).expect(201);
    expect(r.body.message).toContain('reset link');
  });

  // HEALTH
  it('GET /health', async () => {
    const r = await request(app.getHttpServer()).get('/health').expect(200);
    expect(r.body.status).toBe('ok');
  });

  it('GET /health/ready', async () => {
    const r = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(r.body.database).toBe('connected');
  });

  // SOFT DELETE
  it('DELETE /ai-systems/:id - soft delete', async () => {
    await request(app.getHttpServer()).delete(`/ai-systems/${systemId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    // Should not appear in list
    const r = await request(app.getHttpServer()).get('/ai-systems')
      .set('Authorization', `Bearer ${token}`).expect(200);
    const found = r.body.find((s: any) => s.id === systemId);
    expect(found).toBeUndefined();
  });
});

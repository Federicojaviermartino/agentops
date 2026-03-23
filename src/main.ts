import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter, RequestLoggingInterceptor, CacheHeadersInterceptor } from './common/middleware';

// Sentry error monitoring (BLOCKER 11)
let Sentry: any = null;
try {
  Sentry = require('@sentry/node');
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', release: process.env.APP_VERSION || '1.2.0', tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0 });
    console.log('Sentry initialized');
  }
} catch { /* Sentry not installed or DSN not set */ }

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Body size limits (Security: S8)
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // Security
  app.use(helmet({
    contentSecurityPolicy: false, // Handled by CSP middleware
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }, // HSTS (Security: S6)
  }));

  // CORS
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
    .split(',')
    .map(u => u.trim());
  // In production on Render, allow same-origin
  if (process.env.NODE_ENV === 'production') {
    allowedOrigins.push(`https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'agentops-api.onrender.com'}`);
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: false, // S04 FIX: stateless JWT, no cookies needed
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-API-Key', 'stripe-signature'],
  });

  // Static files: serve landing page + public assets
  try {
    app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/' });
  } catch {
    try { app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/' }); } catch {}
  }

  // B08 FIX: API versioning
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'docs', 'docs-json', '/', 'demo', 'demo/login'] });

  // Global filters & interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor(), new CacheHeadersInterceptor());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger (only in non-production or with ENABLE_DOCS=true)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('AgentOps API')
      .setDescription('EU AI Act Compliance Platform | 29 modules, 96 endpoints, 5 AI agents, 21 languages')
      .setVersion(process.env.APP_VERSION || '1.0.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
      .addTag('Demo', 'Public demo access (no auth required)')
      .addTag('Auth', 'Authentication, team management, password reset')
      .addTag('AI Systems', 'Register and manage AI systems')
      .addTag('Assessments', 'Trigger and view compliance assessments')
      .addTag('Findings', 'Compliance findings with workflow')
      .addTag('Documents', 'Generate Annex IV, FRIA, Conformity, Transparency')
      .addTag('Billing', 'Stripe subscriptions')
      .addTag('Monitoring', 'Continuous compliance monitoring')
      .addTag('Analytics', 'Compliance trends and executive summary')
      .addTag('Settings', 'Organization settings, GDPR export')
      .addTag('Webhooks', 'Outgoing webhook configuration (HMAC)')
      .addTag('Search', 'Global search across all entities')
      .addTag('Reports', 'HTML compliance report generation')
      .addTag('Notifications', 'In-app notifications with polling')
      .addTag('i18n', 'Internationalization (21 EU languages)')
      .addTag('Assistant', 'EU AI Act compliance chatbot (14 topics)')
      .addTag('Roadmap', 'Personalized compliance roadmap per system')
      .addTag('Incidents', 'Art. 73 incident reporting (72h/15d)')
      .addTag('Export', 'CSV/JSON data export + compliance evidence package')
      .addTag('Compliance Score', 'A-F grading with 9-area breakdown')
      .addTag('Comparator', 'Multi-regulation: EU AI Act + GDPR + ISO 42001 + NIST')
      .addTag('Timeline', 'Chronological compliance event history')
      .addTag('Checklist', 'Interactive 25-item EU AI Act checklist')
      .addTag('Benchmark', 'Anonymous industry comparison')
      .addTag('API Keys', 'Self-service API key management')
      .addTag('Penalties', 'National penalty tracker for 27 EU countries')
      .addTag('Wizard', 'Compliance in 1 hour guided wizard')
      .addTag('GPAI Compliance', 'GPAI/Foundation model detection and obligations')
      .addTag('Sandbox', 'Regulatory sandbox application generator')
      .addTag('Integrations', 'GitHub/GitLab CI/CD, Jira, Slack, Teams integrations')
      .addTag('Knowledge Base', 'EU AI Act full-text search (RAG-ready)')
      .addTag('Templates', 'Sector-specific Annex IV templates marketplace')
      .addTag('Badge', 'Compliance certification badge and verification')
      .addTag('US Compliance', 'NIST AI RMF + US state laws (CO, NYC, IL, CA)')
      .addTag('Validation', 'Public 50-system validation dataset for benchmarking')
      .addTag('Partners', 'Partner program for consultancies and law firms')
      .addTag('Health', 'Health and readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`AgentOps API running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true') {
    logger.log(`Swagger: http://localhost:${port}/docs`);
  }
  logger.log(`Landing: http://localhost:${port}/`);
  logger.log(`Demo: http://localhost:${port}/demo`);
}

bootstrap();

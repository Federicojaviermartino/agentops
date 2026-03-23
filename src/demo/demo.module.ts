import { Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';

const DEMO_ORG_ID = 'demo-org-00000000';
const DEMO_USER = { id: 'demo-user-00000000', email: 'demo@agentops.eu', name: 'Demo User', role: 'VIEWER', organizationId: DEMO_ORG_ID, locale: 'en' };

@Injectable()
export class DemoService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  getDemoCredentials() {
    return {
      email: 'demo@agentops.eu', password: 'demo',
      note: 'Demo account has read-only access. Data resets daily.',
      features: ['View dashboard', 'Browse AI systems', 'See findings', 'View compliance scores', 'Try the assistant', 'See roadmap', 'Export data'],
      limitations: ['Cannot create systems', 'Cannot run assessments', 'Cannot modify findings', 'Cannot change settings'],
    };
  }

  async getDemoToken() {
    // Upsert demo org and user so JWT validate() finds them
    await this.prisma.organization.upsert({
      where: { id: DEMO_ORG_ID }, update: {},
      create: { id: DEMO_ORG_ID, name: 'AgentOps Demo', plan: 'PROFESSIONAL', settings: { locale: 'en', timezone: 'UTC' } },
    });
    await this.prisma.user.upsert({
      where: { id: DEMO_USER.id }, update: {},
      create: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, passwordHash: '$2b$12$demo.not.used', role: DEMO_USER.role as any, organizationId: DEMO_ORG_ID, locale: 'en' },
    });
    const accessToken = this.jwt.sign({ sub: DEMO_USER.id, email: DEMO_USER.email, role: DEMO_USER.role, organizationId: DEMO_ORG_ID }, { expiresIn: '1h' });
    const refreshToken = this.jwt.sign({ sub: DEMO_USER.id, type: 'refresh' }, { expiresIn: '24h' });
    return { accessToken, refreshToken, user: DEMO_USER, expiresIn: 3600, note: 'Demo token valid 1 hour. Read-only.' };
  }

  getDemoUser() { return DEMO_USER; }
}

@ApiTags('Demo') @Controller('demo')
export class DemoController {
  constructor(private demo: DemoService) {}
  @Get() @ApiOperation({ summary: 'Get demo credentials (public)' })
  getCredentials() { return this.demo.getDemoCredentials(); }
  @Post('login') @ApiOperation({ summary: 'Demo login (returns real JWT, no password needed)' })
  login() { return this.demo.getDemoToken(); }
}

export class SecurityRateLimitMiddleware {
  private store = new Map<string, { count: number; resetAt: number }>();
  use(req: any, res: any, next: any) {
    const ip = req.ip || req.headers?.['x-forwarded-for'] || 'unknown';
    const maxRequests = req.url.includes('/auth/login') || req.url.includes('/auth/register') ? 10 : 100;
    const window = 60000; const now = Date.now();
    const key = `${ip}:${req.url?.split('?')[0] || '/'}`;
    let entry = this.store.get(key);
    if (!entry || entry.resetAt < now) { entry = { count: 0, resetAt: now + window }; this.store.set(key, entry); }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    if (entry.count > maxRequests) { res.status(429).json({ message: 'Too many requests' }); return; }
    next();
  }
}
export class ContentSecurityPolicyMiddleware {
  use(req: any, res: any, next: any) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    next();
  }
}

@Module({
  imports: [PrismaModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret-only-for-local', signOptions: { issuer: 'agentops' } })],
  controllers: [DemoController],
  providers: [DemoService, SecurityRateLimitMiddleware, ContentSecurityPolicyMiddleware],
  exports: [DemoService, SecurityRateLimitMiddleware, ContentSecurityPolicyMiddleware],
})
export class DemoModule {}

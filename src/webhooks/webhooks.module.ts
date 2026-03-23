import { IsString } from 'class-validator';
import { BadRequestException, Body, Controller, Delete, Get, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';
import * as crypto from 'crypto';

class CreateWebhookDto { @IsString() url: string; @IsArray() events: string[]; }

interface WebhookConfig { id: string; url: string; secret: string; events: string[]; active: boolean; createdAt: string; }
const EVENTS = ['assessment.completed', 'assessment.failed', 'finding.created', 'finding.resolved', 'monitoring.alert', 'document.generated'];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(private prisma: PrismaService) {}

  async list(orgId: string): Promise<WebhookConfig[]> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return ((org?.settings as any)?.webhooks || []) as WebhookConfig[];
  }

  async create(orgId: string, dto: CreateWebhookDto) {
    const bad = dto.events.filter(e => !EVENTS.includes(e));
    if (bad.length) throw new BadRequestException(`Invalid events: ${bad.join(', ')}`);
    const wh: WebhookConfig = { id: crypto.randomUUID(), url: dto.url, secret: crypto.randomBytes(32).toString('hex'), events: dto.events, active: true, createdAt: new Date().toISOString() };
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const s = (org?.settings as any) || {};
    s.webhooks = [...(s.webhooks || []), wh];
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: s } });
    return { ...wh, secret: wh.secret.substring(0, 8) + '...' };
  }

  async remove(orgId: string, whId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const s = (org?.settings as any) || {};
    s.webhooks = (s.webhooks || []).filter((w: any) => w.id !== whId);
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: s } });
    return { removed: true };
  }

  async fire(orgId: string, event: string, data: any) {
    const whs = await this.list(orgId);
    for (const wh of whs) {
      if (!wh.active || !wh.events.includes(event)) continue;
      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
      const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
      fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AgentOps-Signature': `sha256=${sig}` }, body, signal: AbortSignal.timeout(10000) })
        .catch(e => this.logger.warn(`Webhook failed: ${wh.url}`));
    }
  }

  getEvents() { return EVENTS; }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private s: WebhooksService) {}
  @Get() @ApiOperation({ summary: 'List all webhooks' }) list(@CurrentUser('organizationId') o: string) { return this.s.list(o); }
  @Get('events') @ApiOperation({ summary: 'List available webhook event types' }) events() { return this.s.getEvents(); }
  @Post() @ApiOperation({ summary: 'Create new webhooks' }) @Roles('OWNER', 'ADMIN') create(@CurrentUser('organizationId') o: string, @Body() d: CreateWebhookDto) { return this.s.create(o, d); }
  @Delete(':id') @ApiOperation({ summary: 'Delete by ID webhooks' }) @Roles('OWNER', 'ADMIN') remove(@CurrentUser('organizationId') o: string, @Param('id') id: string) { return this.s.remove(o, id); }
}

@Module({ imports: [PrismaModule], controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}

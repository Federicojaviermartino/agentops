import { ApiOperation } from '@nestjs/swagger';
import { BadRequestException, Controller, Delete, Get, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';
import * as crypto from 'crypto';

interface ApiKey { id: string; name: string; keyPrefix: string; keyHash: string; permissions: string[]; createdAt: string; lastUsedAt: string | null; requestCount: number; rateLimit: number; active: boolean; }

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  constructor(private prisma: PrismaService) {}

  private async getKeys(orgId: string): Promise<ApiKey[]> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return ((org?.settings as any)?.apiKeys || []) as ApiKey[];
  }
  private async saveKeys(orgId: string, keys: ApiKey[]) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const s = (org?.settings as any) || {};
    s.apiKeys = keys;
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: s } });
  }

  async create(orgId: string, name: string) {
    const keys = await this.getKeys(orgId);
    if (keys.length >= 5) throw new BadRequestException('Maximum 5 API keys per organization');
    const rawKey = `ao_${crypto.randomBytes(24).toString('hex')}`;
    const key: ApiKey = {
      id: crypto.randomUUID(), name,
      keyPrefix: rawKey.substring(0, 10) + '...',
      keyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      permissions: ['read:systems', 'read:findings', 'read:assessments', 'write:assessments'],
      createdAt: new Date().toISOString(), lastUsedAt: null, requestCount: 0,
      rateLimit: 1000, active: true,
    };
    keys.push(key);
    await this.saveKeys(orgId, keys);
    this.logger.log(`API key created: ${name} (${key.keyPrefix})`);
    return { ...key, rawKey }; // Only returned once
  }

  async list(orgId: string) {
    return (await this.getKeys(orgId)).map(k => ({ ...k, keyHash: undefined }));
  }

  async revoke(orgId: string, keyId: string) {
    const keys = await this.getKeys(orgId);
    const idx = keys.findIndex(k => k.id === keyId);
    if (idx === -1) throw new BadRequestException('Key not found');
    keys[idx].active = false;
    await this.saveKeys(orgId, keys);
    return { revoked: true };
  }

  async validate(rawKey: string): Promise<{ orgId: string; permissions: string[] } | null> {
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const orgs = await this.prisma.organization.findMany({ where: { settings: { not: undefined } } });
    for (const org of orgs) {
      const keys = ((org.settings as any)?.apiKeys || []) as ApiKey[];
      const key = keys.find(k => k.keyHash === hash && k.active);
      if (key) { key.lastUsedAt = new Date().toISOString(); key.requestCount++; await this.saveKeys(org.id, keys); return { orgId: org.id, permissions: key.permissions }; }
    }
    return null;
  }
}

@Controller('api-keys')
export class ApiKeysController {
  constructor(private s: ApiKeysService) {}
  @Get() @ApiOperation({ summary: 'List all api keys' }) list(@CurrentUser('organizationId') o: string) { return this.s.list(o); }
  @Post(':name') @ApiOperation({ summary: 'Create new api keys' }) create(@Param('name') name: string, @CurrentUser('organizationId') o: string) { return this.s.create(o, name); }
  @Delete(':id') @ApiOperation({ summary: 'Revoke API key' }) revoke(@Param('id') id: string, @CurrentUser('organizationId') o: string) { return this.s.revoke(o, id); }
}

@Module({ imports: [PrismaModule], controllers: [ApiKeysController], providers: [ApiKeysService], exports: [ApiKeysService] })
export class ApiKeysModule {}

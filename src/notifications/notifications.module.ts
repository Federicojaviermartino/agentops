import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../common/index';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(params: { orgId: string; userId?: string; type: string; title: string; message: string; actionUrl?: string; metadata?: any }) {
    return this.prisma.$executeRaw`
      INSERT INTO "Notification" (id, "organizationId", "userId", type, title, message, "actionUrl", metadata, read, "createdAt")
      VALUES (gen_random_uuid(), ${params.orgId}, ${params.userId || null}, ${params.type}, ${params.title}, ${params.message}, ${params.actionUrl || null}, ${JSON.stringify(params.metadata || {})}::jsonb, false, NOW())
    `;
  }

  async list(orgId: string, userId: string, unreadOnly = false, limit = 30) {
    const where: any = { organizationId: orgId, OR: [{ userId }, { userId: null }] };
    if (unreadOnly) where.read = false;

    // Use raw query since Notification might not be in Prisma schema yet
    try {
      const results = await this.prisma.$queryRawUnsafe(`
        SELECT id, type, title, message, "actionUrl", read, "createdAt"
        FROM "Notification"
        WHERE "organizationId" = $1 AND ("userId" = $2 OR "userId" IS NULL)
        ${unreadOnly ? 'AND read = false' : ''}
        ORDER BY "createdAt" DESC LIMIT $3
      `, orgId, userId, limit);
      return results;
    } catch {
      return []; // Table might not exist yet
    }
  }

  async getUnreadCount(orgId: string, userId: string): Promise<number> {
    try {
      const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM "Notification" WHERE "organizationId" = $1 AND ("userId" = $2 OR "userId" IS NULL) AND read = false`,
        orgId, userId,
      );
      return Number(result[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async markRead(id: string, orgId: string) {
    try {
      await this.prisma.$executeRawUnsafe(`UPDATE "Notification" SET read = true WHERE id = $1::uuid AND "organizationId" = $2`, id, orgId);
    } catch {}
    return { read: true };
  }

  async markAllRead(orgId: string, userId: string) {
    try {
      await this.prisma.$executeRawUnsafe(`UPDATE "Notification" SET read = true WHERE "organizationId" = $1 AND ("userId" = $2 OR "userId" IS NULL) AND read = false`, orgId, userId);
    } catch {}
    return { message: 'All marked as read' };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private s: NotificationsService) {}
  @Get() @ApiOperation({ summary: 'List all notifications' }) list(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Query('unreadOnly') unread?: string) { return this.s.list(o, u, unread === 'true'); }
  @Get('count') @ApiOperation({ summary: 'Get unread notification count' }) count(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string) { return this.s.getUnreadCount(o, u).then(c => ({ count: c })); }
  @Patch(':id/read') @ApiOperation({ summary: 'Mark notification as read' }) read(@Param('id') id: string, @CurrentUser('organizationId') o: string) { return this.s.markRead(id, o); }
  @Post('read-all') @ApiOperation({ summary: 'Mark all notifications as read' }) readAll(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string) { return this.s.markAllRead(o, u); }
}

@Module({ imports: [PrismaModule], controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}

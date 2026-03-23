import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get() @ApiOperation({ summary: 'Health check' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString(), version: process.env.APP_VERSION || '1.0.0' };
  }

  @Get('ready') @ApiOperation({ summary: 'Readiness (checks DB)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected', scheduler: process.env.ENABLE_MONITORING === 'true' ? 'active' : 'disabled', timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: 'not_ready', database: 'disconnected', scheduler: 'unknown', error: (e as Error).message };
    }
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}

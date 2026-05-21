import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  health() {
    return {
      status: 'ok',
      service: 'shellpilot',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (database + redis connectivity)' })
  async ready() {
    const dbReady = this.connection.readyState === 1;
    let redisReady = false;
    try {
      redisReady = (await this.redis.ping()) === 'PONG';
    } catch {
      redisReady = false;
    }

    return {
      status: dbReady && redisReady ? 'ready' : 'not_ready',
      database: dbReady ? 'connected' : 'disconnected',
      redis: redisReady ? 'connected' : 'disconnected',
    };
  }
}

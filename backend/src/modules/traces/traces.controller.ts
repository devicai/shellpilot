import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { TracesService } from './traces.service';
import { CreateTraceDto } from './dto/create-trace.dto';
import { StatsPeriod, StatsService } from './stats/stats.service';
import { AuthenticatedApiKey, ExtensionScope } from '../../interfaces';

@ApiTags('Traces')
@Controller('traces')
export class TracesController {
  constructor(
    private readonly service: TracesService,
    private readonly stats: StatsService,
  ) {}

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Ingest a trace event (consumed by the Go wrapper)' })
  ingest(@Body() dto: CreateTraceDto, @CurrentApiKey() apiKey?: AuthenticatedApiKey) {
    // Attribute the trace to the API key's identity, not a client-supplied id.
    return this.service.ingest(dto, apiKey?.prefix, apiKey?.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'List traces with filters (JWT)' })
  list(
    @Scope() scope: ExtensionScope,
    @Query('cli') cli?: string,
    @Query('userId') userId?: string,
    @Query('decision') decision?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('excludeCli') excludeCli?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // excludeCli accepts a comma-separated list (e.g. "devic-cli-wrapper,devic-wrapper")
    // so the Dashboard and Traces page can hide the wrapper's own lifecycle
    // events without a dedicated endpoint.
    const excluded = excludeCli
      ? excludeCli.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : undefined;
    return this.service.list(
      scope,
      { cli, userId, decision, from, to, excludeCli: excluded },
      {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  @ApiOperation({ summary: 'Aggregated stats for traces (JWT)' })
  statsEndpoint(@Query('period') period?: StatsPeriod) {
    return this.stats.aggregate(period ?? '24h');
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('timeseries')
  @ApiOperation({ summary: 'Trace counts bucketed by hour/day for charts (JWT)' })
  timeseriesEndpoint(@Query('period') period?: StatsPeriod) {
    return this.stats.timeseries(period ?? '24h');
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get trace by id (JWT)' })
  findOne(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    return this.service.findById(id, scope);
  }
}

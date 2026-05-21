import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { TracesRepository } from './traces.repository';
import { Trace } from './schema/trace.schema';
import { CreateTraceDto } from './dto/create-trace.dto';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';

@Injectable()
export class TracesService {
  constructor(
    private readonly repo: TracesRepository,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  private redactArgs(args?: string[]): string[] {
    if (!args || args.length === 0) return [];
    const patterns = this.config.shellpilot.redactPatterns ?? [];
    if (patterns.length === 0) return args;
    return args.map((arg) => {
      for (const p of patterns) {
        const literal = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const re = new RegExp(`^${literal}$`);
        if (re.test(arg)) {
          const eqIdx = arg.indexOf('=');
          if (eqIdx >= 0) return `${arg.slice(0, eqIdx + 1)}***`;
          return '***';
        }
      }
      return arg;
    });
  }

  async ingest(dto: CreateTraceDto, apiKeyPrefix?: string): Promise<Trace> {
    return this.repo.create(
      {
        cli: dto.cli.toLowerCase(),
        commandPath: dto.commandPath ?? [],
        args: this.redactArgs(dto.args),
        decision: dto.decision,
        enforcement: dto.enforcement,
        matchedRuleId: dto.matchedRuleId ? new Types.ObjectId(dto.matchedRuleId) : undefined,
        matchedRulePath: dto.matchedRulePath,
        reason: dto.reason,
        userId: dto.userId ? new Types.ObjectId(dto.userId) : undefined,
        apiKeyPrefix,
        agent: dto.agent,
        durationMs: dto.durationMs,
        exitCode: dto.exitCode,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      } as Partial<Trace>,
      {},
    );
  }

  async list(
    scope: ExtensionScope,
    filter: {
      cli?: string;
      userId?: string;
      decision?: string;
      from?: string;
      to?: string;
      excludeCli?: string[];
    },
    opts: { limit?: number; offset?: number },
  ): Promise<PaginatedResponse<Trace>> {
    const q: FilterQuery<Trace> = {};
    if (filter.cli) q.cli = filter.cli.toLowerCase();
    if (filter.userId) q.userId = new Types.ObjectId(filter.userId);
    if (filter.decision) q.decision = filter.decision;
    if (filter.excludeCli && filter.excludeCli.length > 0) {
      // Mongo: combine explicit `cli` match (if any) with $nin so the caller
      // can ask for "any CLI except devic-cli-wrapper" or "gh but not <list>".
      if (typeof q.cli === 'string') {
        q.cli = { $eq: q.cli, $nin: filter.excludeCli };
      } else {
        q.cli = { $nin: filter.excludeCli };
      }
    }
    if (filter.from || filter.to) {
      q.timestamp = {};
      if (filter.from) (q.timestamp as Record<string, Date>).$gte = new Date(filter.from);
      if (filter.to) (q.timestamp as Record<string, Date>).$lte = new Date(filter.to);
    }
    return this.repo.find(q, scope, { ...opts, sort: { timestamp: -1 } });
  }

  async findById(id: string, scope: ExtensionScope): Promise<Trace> {
    const trace = await this.repo.findById(id, scope);
    if (!trace) throw new NotFoundException('Trace not found');
    return trace;
  }
}

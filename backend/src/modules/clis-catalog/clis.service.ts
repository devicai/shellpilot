import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClisRepository } from './clis.repository';
import { Cli } from './schema/cli.schema';
import { CreateCliDto } from './dto/create-cli.dto';
import { UpdateCliDto } from './dto/update-cli.dto';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';

@Injectable()
export class ClisService {
  constructor(private readonly repo: ClisRepository) {}

  async create(dto: CreateCliDto, scope: ExtensionScope): Promise<Cli> {
    const existing = await this.repo.findBySlug(dto.slug);
    if (existing) throw new ConflictException(`CLI '${dto.slug}' already exists`);
    return this.repo.create(
      { ...dto, slug: dto.slug.toLowerCase(), active: dto.active ?? true } as Partial<Cli>,
      scope,
    );
  }

  async list(scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<Cli>> {
    return this.repo.find({}, scope, opts);
  }

  async findOne(idOrSlug: string, scope: ExtensionScope): Promise<Cli> {
    const bySlug = await this.repo.findBySlug(idOrSlug);
    if (bySlug) return bySlug;
    const byId = await this.repo.findById(idOrSlug, scope);
    if (!byId) throw new NotFoundException('CLI not found');
    return byId;
  }

  async update(id: string, dto: UpdateCliDto, scope: ExtensionScope): Promise<Cli> {
    const updated = await this.repo.updateById(id, dto as Partial<Cli>, scope);
    if (!updated) throw new NotFoundException('CLI not found');
    return updated;
  }

  async delete(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.repo.deleteById(id, scope);
    if (!ok) throw new NotFoundException('CLI not found');
  }
}

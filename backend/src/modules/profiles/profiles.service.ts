import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProfilesRepository } from './profiles.repository';
import { Profile } from './schema/profile.schema';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';

@Injectable()
export class ProfilesService {
  constructor(private readonly repo: ProfilesRepository) {}

  async create(dto: CreateProfileDto, scope: ExtensionScope): Promise<Profile> {
    const existing = await this.repo.findByName(dto.name);
    if (existing) throw new ConflictException(`Profile '${dto.name}' already exists`);
    return this.repo.create(
      {
        name: dto.name,
        description: dto.description,
        clis: dto.clis ?? [],
        policyId: dto.policyId ? new Types.ObjectId(dto.policyId) : undefined,
        defaultCredentials: dto.defaultCredentials,
        active: dto.active ?? true,
      } as Partial<Profile>,
      scope,
    );
  }

  async list(scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<Profile>> {
    return this.repo.find({}, scope, opts);
  }

  async findById(id: string, scope: ExtensionScope): Promise<Profile> {
    const p = await this.repo.findById(id, scope);
    if (!p) throw new NotFoundException('Profile not found');
    return p;
  }

  async update(id: string, dto: UpdateProfileDto, scope: ExtensionScope): Promise<Profile> {
    const patch: Partial<Profile> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.clis !== undefined) patch.clis = dto.clis;
    if (dto.policyId !== undefined) patch.policyId = new Types.ObjectId(dto.policyId);
    if (dto.defaultCredentials !== undefined) patch.defaultCredentials = dto.defaultCredentials;
    if (dto.active !== undefined) patch.active = dto.active;
    const updated = await this.repo.updateById(id, patch, scope);
    if (!updated) throw new NotFoundException('Profile not found');
    return updated;
  }

  async delete(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.repo.deleteById(id, scope);
    if (!ok) throw new NotFoundException('Profile not found');
  }
}

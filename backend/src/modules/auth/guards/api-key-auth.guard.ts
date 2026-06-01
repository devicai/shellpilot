import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { AuthenticatedRequest } from '../../../interfaces';
import { Types } from 'mongoose';

const HEADER = 'x-api-key';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = req.headers[HEADER];
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }
    const result = await this.apiKeys.verify(rawToken);
    if (!result) {
      throw new UnauthorizedException('Invalid API key');
    }
    req.apiKey = {
      id: result.id,
      prefix: result.apiKey.prefix,
      userId: String((result.apiKey.userId as unknown as Types.ObjectId) ?? ''),
      scopes: result.apiKey.scopes,
      scope: result.scope,
    };
    return true;
  }
}

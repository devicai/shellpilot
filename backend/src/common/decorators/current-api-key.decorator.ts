import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedApiKey, AuthenticatedRequest } from '../../interfaces';

export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedApiKey | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.apiKey;
  },
);

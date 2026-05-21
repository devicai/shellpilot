import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, ExtensionScope } from '../../interfaces';

export const Scope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ExtensionScope => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.extensionScope ?? {};
  },
);

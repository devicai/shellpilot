import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schema/user.schema';
import { AuthenticatedRequest, ExtensionScope } from '../../../interfaces';
import { ExtensionProperty } from '../../../config/config.types';
import { EXTENSIONS_TOKEN } from '../../../providers/extensions.provider';
import {
  ACT_AS_SCOPE,
  ACT_AS_USER_HEADER,
  ACT_AS_ROLE_HEADER,
  ACT_AS_EMAIL_HEADER,
  ACT_AS_NAME_HEADER,
} from '../../../common/auth-scopes';

const HEADER = 'x-api-key';
const VALID_ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly users: UsersService,
    @Inject(EXTENSIONS_TOKEN) private readonly extensions: ExtensionProperty[],
  ) {}

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

    // Delegation: a trusted service caller (key carrying the `act-as` scope) may
    // act on behalf of an end user it has already authenticated, asserted via the
    // `x-user-*` headers. We resolve/JIT-provision that user and attach it as the
    // request principal, so role checks and per-user scoping below treat the
    // request as that user. Keys without the scope have these headers ignored.
    if (req.apiKey.scopes?.includes(ACT_AS_SCOPE)) {
      await this.applyDelegation(req);
    }

    return true;
  }

  private async applyDelegation(req: AuthenticatedRequest): Promise<void> {
    const externalUserId = headerValue(req.headers[ACT_AS_USER_HEADER]);
    if (!externalUserId) return; // act-as key used without delegation → caller is the key itself

    // Tenant for the acted-as user comes from the extension headers (the caller
    // is global; its own key carries no tenant). Mirror the interceptor's logic.
    const delegatedScope: ExtensionScope = {};
    for (const ext of this.extensions) {
      const v = headerValue(req.headers[ext.headerName.toLowerCase()]);
      if (v) delegatedScope[ext.name] = v;
    }

    const user = await this.users.ssoUpsert(
      {
        externalUserId,
        email: headerValue(req.headers[ACT_AS_EMAIL_HEADER]),
        name: headerValue(req.headers[ACT_AS_NAME_HEADER]),
      },
      delegatedScope,
    );

    // The role is the source-of-truth from the asserting caller, not the local
    // mirror (which a JIT'd user starts at the default). Fall back to the stored
    // role if the header is missing or not a recognised role.
    const asserted = headerValue(req.headers[ACT_AS_ROLE_HEADER]) as UserRole | undefined;
    const role = asserted && VALID_ROLES.includes(asserted) ? asserted : user.role;

    req.user = {
      id: String((user as unknown as { _id: Types.ObjectId })._id),
      email: user.email,
      role,
      name: user.name,
      scope: delegatedScope,
    };
  }
}

/** Normalise a possibly-array header to its first string value. */
function headerValue(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

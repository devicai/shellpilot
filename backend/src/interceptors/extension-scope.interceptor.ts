import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ExtensionProperty } from '../config/config.types';
import { ExtensionScope } from '../interfaces';
import { EXTENSIONS_TOKEN } from '../providers/extensions.provider';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class ExtensionScopeInterceptor implements NestInterceptor {
  constructor(
    @Inject(EXTENSIONS_TOKEN)
    private readonly extensions: ExtensionProperty[],
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    // Header-supplied scope (used by internal/global callers).
    const headerScope: ExtensionScope = {};
    for (const ext of this.extensions) {
      const headerValue = req.headers[ext.headerName.toLowerCase()];
      if (headerValue) headerScope[ext.name] = headerValue;
    }

    // Identity-supplied scope. Guards run before interceptors, so the principal
    // is already attached. A principal that carries an extension value (e.g.
    // clientUID) PINS that tenant — it overrides any header, so an authenticated
    // request can never be widened beyond its own tenant. A principal without the
    // value (global/internal caller) falls back to the header.
    const principalScope: ExtensionScope = req.apiKey?.scope ?? req.user?.scope ?? {};
    const scope: ExtensionScope = { ...headerScope, ...principalScope };

    // Public routes (login, public-config, health) carry no scope and must not be
    // forced to provide one.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) {
      for (const ext of this.extensions) {
        if (ext.required && !scope[ext.name]) {
          const res = context.switchToHttp().getResponse();
          res.status(400).json({
            statusCode: 400,
            error: 'Bad Request',
            message: `Missing required scope: ${ext.name} (header ${ext.headerName} or an authenticated principal carrying it)`,
            details: { header: ext.headerName, extension: ext.name },
          });
          return new Observable((subscriber) => subscriber.complete());
        }
      }
    }

    req.extensionScope = scope;
    return next.handle();
  }
}

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CONFIG } from '../../../config/config.loader';
import { ShellpilotModuleConfig } from '../../../config/config.types';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../../../interfaces';
import { Types } from 'mongoose';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthenticatedUser['role'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(CONFIG) config: ShellpilotModuleConfig,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwt.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = (await this.users.findById(payload.sub, {})) as unknown as {
      _id: Types.ObjectId;
      email: string;
      role: AuthenticatedUser['role'];
      name?: string;
      active: boolean;
    };
    if (!user || !user.active) {
      throw new UnauthorizedException('User no longer active');
    }
    return { id: String(user._id), email: user.email, role: user.role, name: user.name };
  }
}

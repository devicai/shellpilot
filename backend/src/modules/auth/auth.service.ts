import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser } from '../../interfaces';
import { Types } from 'mongoose';

export interface AuthResponse {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = (await this.users.verifyPassword(dto.email, dto.password)) as
      | (null | { _id: Types.ObjectId; email: string; role: AuthenticatedUser['role']; name?: string });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const id = String(user._id);
    await this.users.touchLastLogin(id);

    const accessToken = this.jwt.sign({ sub: id, email: user.email, role: user.role });
    return {
      accessToken,
      expiresIn: this.config.auth.jwt.expiresIn,
      user: { id, email: user.email, role: user.role, name: user.name },
    };
  }

  async refresh(current: AuthenticatedUser): Promise<AuthResponse> {
    const accessToken = this.jwt.sign({ sub: current.id, email: current.email, role: current.role });
    return { accessToken, expiresIn: this.config.auth.jwt.expiresIn, user: current };
  }
}

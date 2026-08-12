import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminsService } from '../admins/admins.service';
import { UsersService } from '../users/users.service';
import { AuthPrincipal, JwtPayload } from './auth.types';

/**
 * Verifies JWT signature/expiry (passport-jwt), then re-loads principal from DB
 * so deactivated users/admins/orgs cannot keep using unexpired tokens.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly adminsService: AdminsService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    if (!payload?.sub || !payload?.typ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.typ === 'admin') {
      const admin = await this.adminsService.findById(payload.sub);
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException();
      }
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        typ: 'admin',
      };
    }

    if (payload.typ === 'user') {
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException();
      }
      if (!user.organization || !user.organization.isActive) {
        throw new UnauthorizedException();
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        typ: 'user',
        orgId: user.organizationId,
        role: user.role,
      };
    }

    throw new UnauthorizedException('Unknown token type');
  }
}

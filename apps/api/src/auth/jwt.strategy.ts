import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthPrincipal, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    if (!payload?.sub || !payload?.typ || !payload?.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.typ === 'admin') {
      return {
        id: payload.sub,
        email: payload.email,
        name: null,
        typ: 'admin',
      };
    }

    if (payload.typ === 'user') {
      if (!payload.orgId || !payload.role) {
        throw new UnauthorizedException('Invalid user token payload');
      }
      return {
        id: payload.sub,
        email: payload.email,
        name: null,
        typ: 'user',
        orgId: payload.orgId,
        role: payload.role,
      };
    }

    throw new UnauthorizedException('Unknown token type');
  }
}

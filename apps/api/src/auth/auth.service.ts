import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminsService } from '../admins/admins.service';
import { normalizeEmail, verifyPassword } from '../common/password.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserLoginDto } from './dto/user-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async adminLogin(dto: AdminLoginDto): Promise<TokenResponseDto> {
    const admin = await this.adminsService.findByEmail(dto.email);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(dto.password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: admin.id,
      typ: 'admin',
      email: admin.email,
    };
    return this.signToken(payload);
  }

  async userLogin(dto: UserLoginDto): Promise<TokenResponseDto> {
    if (!dto.organizationId && !dto.organizationSlug) {
      throw new BadRequestException(
        'organizationSlug or organizationId is required',
      );
    }

    let org;
    try {
      org = dto.organizationId
        ? await this.organizationsService.findById(dto.organizationId)
        : await this.organizationsService.findBySlug(dto.organizationSlug!);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!org || !org.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findByOrgAndEmail(
      org.id,
      normalizeEmail(dto.email),
    );
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      typ: 'user',
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    };
    return this.signToken(payload);
  }

  async getAdminProfile(adminId: string) {
    const admin = await this.adminsService.findById(adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      typ: 'admin' as const,
    };
  }

  async getUserProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
          }
        : { id: user.organizationId },
      typ: 'user' as const,
    };
  }

  private signToken(payload: JwtPayload): TokenResponseDto {
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '8h');
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: expiresIn,
    };
  }
}

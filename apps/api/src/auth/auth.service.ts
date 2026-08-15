import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminsService } from '../admins/admins.service';
import { EmailService } from '../email/email.service';
import {
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from '../common/password.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto, AdminResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserLoginDto } from './dto/user-login.dto';
import { LoginRateLimitService } from './login-rate-limit.service';
import {
  buildInviteEmail,
  buildPasswordChangedEmail,
  buildResetEmail,
} from './password-mail';
import {
  PasswordTokenKind,
  PasswordTokenPurpose,
} from './password-reset-token.entity';
import { PasswordTokensService } from './password-tokens.service';

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_LINK = 'Invalid or expired reset link';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly adminsService: AdminsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly passwordTokens: PasswordTokensService,
    private readonly rateLimit: LoginRateLimitService,
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
    if (!user || !user.isActive || !user.passwordHash) {
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
    // Org deactivation must revoke access even if the user row is still active.
    if (!user.organization || !user.organization.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      typ: 'user' as const,
    };
  }

  async sendUserInvite(
    user: User,
    org: { name: string; slug: string },
  ): Promise<void> {
    const ttlMs = this.inviteTtlMs();
    const raw = await this.passwordTokens.issueUserToken({
      userId: user.id,
      purpose: PasswordTokenPurpose.INVITE,
      ttlMs,
    });
    const origin = this.portalOrigin();
    if (!origin) {
      this.logger.warn(
        'Invite email skipped: PORTAL_PUBLIC_URL is not set',
      );
      return;
    }
    const url = this.buildPortalUrl(origin, '/set-password', {
      token: raw,
      email: user.email,
      org: org.slug,
    });
    const mail = buildInviteEmail({
      organizationName: org.name,
      setPasswordUrl: url,
      expiresLabel: this.ttlLabel(ttlMs),
    });
    await this.emailService.send({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
    });
  }

  async changeUserPassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    this.consumeChangeLimit(`change-password:user:${userId}`);
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.organization || !user.organization.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }
    const nextHash = await hashPassword(dto.newPassword);
    await this.usersService.updatePasswordHash(user.id, nextHash);
    await this.passwordTokens.invalidateForUser(user.id);
    await this.sendPasswordChanged(user.email);
    return { ok: true };
  }

  async changeAdminPassword(
    adminId: string,
    dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    this.consumeChangeLimit(`change-password:admin:${adminId}`);
    const admin = await this.adminsService.findById(adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await verifyPassword(dto.currentPassword, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }
    const nextHash = await hashPassword(dto.newPassword);
    await this.adminsService.updatePasswordHash(admin.id, nextHash);
    await this.passwordTokens.invalidateForAdmin(admin.id);
    await this.sendPasswordChanged(admin.email);
    return { ok: true };
  }

  async setUserPassword(dto: SetPasswordDto): Promise<{ ok: true }> {
    const org = await this.findActiveOrgBySlug(dto.organizationSlug);
    if (!org) {
      throw new BadRequestException(INVALID_LINK);
    }
    const user = await this.usersService.findByOrgAndEmail(
      org.id,
      normalizeEmail(dto.email),
    );
    if (!user || !user.isActive || user.passwordHash) {
      throw new BadRequestException(INVALID_LINK);
    }
    const token = await this.passwordTokens.findValid({
      rawToken: dto.token,
      kind: PasswordTokenKind.USER,
      purpose: PasswordTokenPurpose.INVITE,
    });
    if (!token || token.userId !== user.id) {
      throw new BadRequestException(INVALID_LINK);
    }
    const nextHash = await hashPassword(dto.newPassword);
    await this.usersService.updatePasswordHash(user.id, nextHash);
    await this.passwordTokens.markUsed(token);
    await this.passwordTokens.invalidateForUser(user.id);
    await this.sendPasswordChanged(user.email);
    return { ok: true };
  }

  async forgotUserPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const org = await this.findActiveOrgBySlug(dto.organizationSlug);
    if (!org) {
      return { ok: true };
    }
    const user = await this.usersService.findByOrgAndEmail(
      org.id,
      normalizeEmail(dto.email),
    );
    if (!user || !user.isActive) {
      return { ok: true };
    }
    if (!user.passwordHash) {
      await this.sendUserInvite(user, { name: org.name, slug: org.slug });
      return { ok: true };
    }
    await this.sendUserReset(user, org.slug);
    return { ok: true };
  }

  async forgotAdminPassword(email: string): Promise<{ ok: true }> {
    const admin = await this.adminsService.findByEmail(email);
    if (!admin || !admin.isActive) {
      return { ok: true };
    }
    const ttlMs = this.resetTtlMs();
    const raw = await this.passwordTokens.issueAdminToken({
      adminId: admin.id,
      purpose: PasswordTokenPurpose.RESET,
      ttlMs,
    });
    const origin = this.portalOrigin();
    if (!origin) {
      this.logger.warn('Admin reset email skipped: PORTAL_PUBLIC_URL is not set');
      return { ok: true };
    }
    const url = this.buildPortalUrl(origin, '/admin-reset-password', {
      token: raw,
      email: admin.email,
    });
    const mail = buildResetEmail({
      resetUrl: url,
      expiresLabel: this.ttlLabel(ttlMs),
    });
    await this.emailService.send({
      to: admin.email,
      subject: mail.subject,
      html: mail.html,
    });
    return { ok: true };
  }

  async resetUserPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    const org = await this.findActiveOrgBySlug(dto.organizationSlug);
    if (!org) {
      throw new BadRequestException(INVALID_LINK);
    }
    const user = await this.usersService.findByOrgAndEmail(
      org.id,
      normalizeEmail(dto.email),
    );
    if (!user || !user.isActive || !user.passwordHash) {
      throw new BadRequestException(INVALID_LINK);
    }
    const token = await this.passwordTokens.findValid({
      rawToken: dto.token,
      kind: PasswordTokenKind.USER,
      purpose: PasswordTokenPurpose.RESET,
    });
    if (!token || token.userId !== user.id) {
      throw new BadRequestException(INVALID_LINK);
    }
    const nextHash = await hashPassword(dto.newPassword);
    await this.usersService.updatePasswordHash(user.id, nextHash);
    await this.passwordTokens.markUsed(token);
    await this.passwordTokens.invalidateForUser(user.id);
    await this.sendPasswordChanged(user.email);
    return { ok: true };
  }

  async resetAdminPassword(dto: AdminResetPasswordDto): Promise<{ ok: true }> {
    const admin = await this.adminsService.findByEmail(dto.email);
    if (!admin || !admin.isActive) {
      throw new BadRequestException(INVALID_LINK);
    }
    const token = await this.passwordTokens.findValid({
      rawToken: dto.token,
      kind: PasswordTokenKind.ADMIN,
      purpose: PasswordTokenPurpose.RESET,
    });
    if (!token || token.adminId !== admin.id) {
      throw new BadRequestException(INVALID_LINK);
    }
    const nextHash = await hashPassword(dto.newPassword);
    await this.adminsService.updatePasswordHash(admin.id, nextHash);
    await this.passwordTokens.markUsed(token);
    await this.passwordTokens.invalidateForAdmin(admin.id);
    await this.sendPasswordChanged(admin.email);
    return { ok: true };
  }

  private async sendUserReset(user: User, orgSlug: string): Promise<void> {
    const ttlMs = this.resetTtlMs();
    const raw = await this.passwordTokens.issueUserToken({
      userId: user.id,
      purpose: PasswordTokenPurpose.RESET,
      ttlMs,
    });
    const origin = this.portalOrigin();
    if (!origin) {
      this.logger.warn('Reset email skipped: PORTAL_PUBLIC_URL is not set');
      return;
    }
    const url = this.buildPortalUrl(origin, '/reset-password', {
      token: raw,
      email: user.email,
      org: orgSlug,
    });
    const mail = buildResetEmail({
      resetUrl: url,
      expiresLabel: this.ttlLabel(ttlMs),
    });
    await this.emailService.send({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
    });
  }

  private async sendPasswordChanged(to: string): Promise<void> {
    const mail = buildPasswordChangedEmail();
    await this.emailService.send({
      to,
      subject: mail.subject,
      html: mail.html,
    });
  }

  private async findActiveOrgBySlug(slug: string) {
    try {
      const org = await this.organizationsService.findBySlug(slug);
      if (!org || !org.isActive) {
        return null;
      }
      return org;
    } catch {
      return null;
    }
  }

  private consumeChangeLimit(key: string): void {
    const result = this.rateLimit.consume(key);
    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private portalOrigin(): string | null {
    const raw = this.config.get<string>('PORTAL_PUBLIC_URL')?.trim() ?? '';
    return raw ? raw.replace(/\/$/, '') : null;
  }

  private buildPortalUrl(
    origin: string,
    path: string,
    query: Record<string, string>,
  ): string {
    const url = new URL(path, `${origin}/`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private inviteTtlMs(): number {
    return Number(
      this.config.get<string | number>(
        'PASSWORD_INVITE_TTL_MS',
        DEFAULT_INVITE_TTL_MS,
      ),
    );
  }

  private resetTtlMs(): number {
    return Number(
      this.config.get<string | number>(
        'PASSWORD_RESET_TTL_MS',
        DEFAULT_RESET_TTL_MS,
      ),
    );
  }

  private ttlLabel(ttlMs: number): string {
    const hours = ttlMs / (60 * 60 * 1000);
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return days === 1 ? '1 day' : `${days} days`;
    }
    if (hours >= 1 && hours % 1 === 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    const minutes = Math.max(1, Math.round(ttlMs / 60_000));
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
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

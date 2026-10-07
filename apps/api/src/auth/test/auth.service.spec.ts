import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminsService } from '../../admins/admins.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/user.entity';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth.service';
import { LoginRateLimitService } from '../login-rate-limit.service';
import {
  PasswordTokenKind,
  PasswordTokenPurpose,
} from '../password-reset-token.entity';
import { PasswordLifecycleService } from '../password-lifecycle.service';

jest.mock('../../common/password.util', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  verifyPassword: jest.fn(),
  hashPassword: jest.fn(),
}));

import { hashPassword, verifyPassword } from '../../common/password.util';

const verifyPasswordMock = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;
const hashPasswordMock = hashPassword as jest.MockedFunction<
  typeof hashPassword
>;

describe('AuthService', () => {
  let service: AuthService;
  let adminsService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    updateName: jest.Mock;
  };
  let usersService: {
    findByOrgAndEmail: jest.Mock;
    findById: jest.Mock;
    updateName: jest.Mock;
  };
  let emailService: { send: jest.Mock };
  let passwordTokens: {
    issueToken: jest.Mock;
    replacePasswordFromToken: jest.Mock;
    changePassword: jest.Mock;
  };
  let rateLimit: { consume: jest.Mock };
  let organizationsService: {
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };

  const orgA = {
    id: 'org-a-id',
    name: 'Org A',
    slug: 'org-a',
    isActive: true,
  };
  const orgB = {
    id: 'org-b-id',
    name: 'Org B',
    slug: 'org-b',
    isActive: true,
  };

  const activeUserInOrgA = {
    id: 'user-a-id',
    email: 'agent@acme.com',
    name: 'Agent A',
    passwordHash: 'hash-user-a',
    organizationId: orgA.id,
    role: UserRole.ORG_ADMIN,
    isActive: true,
    organization: orgA,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const activeAdmin = {
    id: 'admin-id',
    email: 'admin@local.dev',
    name: 'Platform Admin',
    passwordHash: 'hash-admin',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  beforeEach(async () => {
    adminsService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateName: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      findByOrgAndEmail: jest.fn(),
      findById: jest.fn(),
      updateName: jest.fn().mockResolvedValue(undefined),
    };
    organizationsService = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('test.jwt.token'),
    };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'PORTAL_PUBLIC_URL') return 'https://portal.speeko.ai';
        if (key === 'JWT_EXPIRES_IN') return '8h';
        return fallback ?? '8h';
      }),
    };
    emailService = {
      send: jest.fn().mockResolvedValue({ ok: true, id: 'em' }),
    };
    passwordTokens = {
      issueToken: jest.fn().mockResolvedValue('raw-token-value-32b'),
      replacePasswordFromToken: jest.fn().mockResolvedValue(undefined),
      changePassword: jest.fn().mockResolvedValue(undefined),
    };
    rateLimit = {
      consume: jest.fn().mockReturnValue({ allowed: true, retryAfterSec: 0 }),
    };
    verifyPasswordMock.mockReset();
    verifyPasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockReset();
    hashPasswordMock.mockResolvedValue('new-hash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AdminsService, useValue: adminsService },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EmailService, useValue: emailService },
        { provide: PasswordLifecycleService, useValue: passwordTokens },
        { provide: LoginRateLimitService, useValue: rateLimit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('userLogin — tenant isolation & status', () => {
    it('1. user from Org A cannot authenticate into Org B (by slug)', async () => {
      organizationsService.findBySlug.mockResolvedValue(orgB);
      usersService.findByOrgAndEmail.mockResolvedValue(null);

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationSlug: orgB.slug,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(usersService.findByOrgAndEmail).toHaveBeenCalledWith(
        orgB.id,
        activeUserInOrgA.email,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('1b. user from Org A cannot authenticate into Org B (by organizationId)', async () => {
      organizationsService.findById.mockResolvedValue(orgB);
      usersService.findByOrgAndEmail.mockResolvedValue(null);

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationId: orgB.id,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(usersService.findByOrgAndEmail).toHaveBeenCalledWith(
        orgB.id,
        activeUserInOrgA.email,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('2. inactive organization cannot authenticate its users', async () => {
      organizationsService.findBySlug.mockResolvedValue({
        ...orgA,
        isActive: false,
      });

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationSlug: orgA.slug,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(usersService.findByOrgAndEmail).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('rejects login when the user has not set a password', async () => {
      organizationsService.findBySlug.mockResolvedValue(orgA);
      usersService.findByOrgAndEmail.mockResolvedValue({
        ...activeUserInOrgA,
        passwordHash: null,
      });

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationSlug: orgA.slug,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('3. inactive user cannot authenticate', async () => {
      organizationsService.findBySlug.mockResolvedValue(orgA);
      usersService.findByOrgAndEmail.mockResolvedValue({
        ...activeUserInOrgA,
        isActive: false,
      });

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationSlug: orgA.slug,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('5. incorrect user password never produces a token', async () => {
      organizationsService.findBySlug.mockResolvedValue(orgA);
      usersService.findByOrgAndEmail.mockResolvedValue(activeUserInOrgA);
      verifyPasswordMock.mockResolvedValue(false);

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'WrongPass99!',
          organizationSlug: orgA.slug,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('rejects when organization is not found (slug)', async () => {
      organizationsService.findBySlug.mockResolvedValue(null);

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationSlug: 'missing',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('rejects when organizationId lookup throws NotFoundException', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException('Organization not found'),
      );

      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
          organizationId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('requires organizationSlug or organizationId', async () => {
      await expect(
        service.userLogin({
          email: activeUserInOrgA.email,
          password: 'SecurePass123!',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('userLogin — successful JWT claims', () => {
    beforeEach(() => {
      organizationsService.findBySlug.mockResolvedValue(orgA);
      usersService.findByOrgAndEmail.mockResolvedValue(activeUserInOrgA);
      verifyPasswordMock.mockResolvedValue(true);
    });

    it('6–9. user JWT has typ=user, correct orgId and role', async () => {
      const result = await service.userLogin({
        email: activeUserInOrgA.email,
        password: 'SecurePass123!',
        organizationSlug: orgA.slug,
      });

      expect(result).toEqual({
        access_token: 'test.jwt.token',
        token_type: 'Bearer',
        expires_in: '8h',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: activeUserInOrgA.id,
        typ: 'user',
        email: activeUserInOrgA.email,
        orgId: orgA.id,
        role: UserRole.ORG_ADMIN,
      });
    });
  });

  describe('adminLogin', () => {
    it('4. inactive admin cannot authenticate', async () => {
      adminsService.findByEmail.mockResolvedValue({
        ...activeAdmin,
        isActive: false,
      });

      await expect(
        service.adminLogin({
          email: activeAdmin.email,
          password: 'Admin123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('5. incorrect admin password never produces a token', async () => {
      adminsService.findByEmail.mockResolvedValue(activeAdmin);
      verifyPasswordMock.mockResolvedValue(false);

      await expect(
        service.adminLogin({
          email: activeAdmin.email,
          password: 'WrongAdmin!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('7. admin JWT has typ=admin', async () => {
      adminsService.findByEmail.mockResolvedValue(activeAdmin);
      verifyPasswordMock.mockResolvedValue(true);

      const result = await service.adminLogin({
        email: activeAdmin.email,
        password: 'Admin123!',
      });

      expect(result.access_token).toBe('test.jwt.token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: activeAdmin.id,
        typ: 'admin',
        email: activeAdmin.email,
      });
      const payload = jwtService.sign.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(payload).not.toHaveProperty('orgId');
      expect(payload).not.toHaveProperty('role');
    });

    it('rejects unknown admin email', async () => {
      adminsService.findByEmail.mockResolvedValue(null);

      await expect(
        service.adminLogin({
          email: 'nobody@local.dev',
          password: 'Admin123!',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('getAdminProfile / getUserProfile', () => {
    it('14. getAdminProfile rejects missing admin', async () => {
      adminsService.findById.mockResolvedValue(null);

      await expect(service.getAdminProfile('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('14. getAdminProfile rejects deactivated admin', async () => {
      adminsService.findById.mockResolvedValue({
        ...activeAdmin,
        isActive: false,
      });

      await expect(
        service.getAdminProfile(activeAdmin.id),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('14. getUserProfile rejects missing user', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.getUserProfile('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('14. getUserProfile rejects deactivated user', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUserInOrgA,
        isActive: false,
      });

      await expect(
        service.getUserProfile(activeUserInOrgA.id),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects getUserProfile when organization is inactive', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUserInOrgA,
        organization: { ...orgA, isActive: false },
      });

      await expect(
        service.getUserProfile(activeUserInOrgA.id),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects getUserProfile when organization relation is missing', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUserInOrgA,
        organization: undefined,
      });

      await expect(
        service.getUserProfile(activeUserInOrgA.id),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('15. admin profile never includes password hashes', async () => {
      adminsService.findById.mockResolvedValue(activeAdmin);

      const profile = await service.getAdminProfile(activeAdmin.id);

      expect(profile).toEqual({
        id: activeAdmin.id,
        email: activeAdmin.email,
        name: activeAdmin.name,
        isActive: true,
        createdAt: activeAdmin.createdAt,
        updatedAt: activeAdmin.updatedAt,
        typ: 'admin',
      });
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('password_hash');
      expect(JSON.stringify(profile)).not.toContain(activeAdmin.passwordHash);
    });

    it('15. user profile never includes password hashes', async () => {
      usersService.findById.mockResolvedValue(activeUserInOrgA);

      const profile = await service.getUserProfile(activeUserInOrgA.id);

      expect(profile).toEqual({
        id: activeUserInOrgA.id,
        email: activeUserInOrgA.email,
        name: activeUserInOrgA.name,
        role: UserRole.ORG_ADMIN,
        isActive: true,
        organization: {
          id: orgA.id,
          name: orgA.name,
          slug: orgA.slug,
        },
        createdAt: activeUserInOrgA.createdAt,
        updatedAt: activeUserInOrgA.updatedAt,
        typ: 'user',
      });
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('password_hash');
      expect(JSON.stringify(profile)).not.toContain(
        activeUserInOrgA.passwordHash,
      );
    });
  });

  describe('updateUserProfile / updateAdminProfile', () => {
    it('updates user display name and returns the profile without hashes', async () => {
      let current = { ...activeUserInOrgA };
      usersService.findById.mockImplementation(async () => current);
      usersService.updateName.mockImplementation(
        async (_id: string, name: string) => {
          current = { ...current, name };
        },
      );

      const profile = await service.updateUserProfile(activeUserInOrgA.id, {
        name: '  Ada Lovelace  ',
      });

      expect(usersService.updateName).toHaveBeenCalledWith(
        activeUserInOrgA.id,
        'Ada Lovelace',
      );
      expect(profile.name).toBe('Ada Lovelace');
      expect(profile.email).toBe(activeUserInOrgA.email);
      expect(profile).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(profile)).not.toContain(
        activeUserInOrgA.passwordHash,
      );
    });

    it('rejects empty user display name', async () => {
      await expect(
        service.updateUserProfile(activeUserInOrgA.id, { name: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.updateName).not.toHaveBeenCalled();
    });

    it('rejects profile update for inactive user', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUserInOrgA,
        isActive: false,
      });

      await expect(
        service.updateUserProfile(activeUserInOrgA.id, { name: 'Ada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updateName).not.toHaveBeenCalled();
    });

    it('updates admin display name and returns the profile without hashes', async () => {
      let current = { ...activeAdmin };
      adminsService.findById.mockImplementation(async () => current);
      adminsService.updateName.mockImplementation(
        async (_id: string, name: string) => {
          current = { ...current, name };
        },
      );

      const profile = await service.updateAdminProfile(activeAdmin.id, {
        name: '  Ops Lead  ',
      });

      expect(adminsService.updateName).toHaveBeenCalledWith(
        activeAdmin.id,
        'Ops Lead',
      );
      expect(profile.name).toBe('Ops Lead');
      expect(profile).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(profile)).not.toContain(activeAdmin.passwordHash);
    });

    it('rejects empty admin display name', async () => {
      await expect(
        service.updateAdminProfile(activeAdmin.id, { name: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adminsService.updateName).not.toHaveBeenCalled();
    });

    it('rejects profile update for inactive admin', async () => {
      adminsService.findById.mockResolvedValue({
        ...activeAdmin,
        isActive: false,
      });

      await expect(
        service.updateAdminProfile(activeAdmin.id, { name: 'Ops Lead' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(adminsService.updateName).not.toHaveBeenCalled();
    });
  });

  describe('change / set / forgot / reset password', () => {
    const principal = {
      kind: PasswordTokenKind.USER,
      id: activeUserInOrgA.id,
      organizationId: orgA.id,
    };
    const reset = {
      email: activeUserInOrgA.email,
      organizationSlug: orgA.slug,
      token: 'reset-token-value-xxxx',
      newPassword: 'NewPass123!',
    };
    beforeEach(() => {
      organizationsService.findBySlug.mockResolvedValue(orgA);
      usersService.findByOrgAndEmail.mockResolvedValue(activeUserInOrgA);
      usersService.findById.mockResolvedValue(activeUserInOrgA);
      adminsService.findById.mockResolvedValue(activeAdmin);
      adminsService.findByEmail.mockResolvedValue(activeAdmin);
    });
    it('changes passwords through the lifecycle and notifies after commit', async () => {
      await expect(
        service.changeUserPassword(activeUserInOrgA.id, {
          currentPassword: 'old',
          newPassword: reset.newPassword,
        }),
      ).resolves.toEqual({ ok: true });
      expect(passwordTokens.changePassword).toHaveBeenCalledWith({
        principal,
        email: reset.email,
        currentPassword: 'old',
        newPassword: reset.newPassword,
      });
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your Speeko password was changed',
        }),
      );
      expect(
        passwordTokens.changePassword.mock.invocationCallOrder[0],
      ).toBeLessThan(emailService.send.mock.invocationCallOrder[0]);
    });
    it('does not notify when a password change fails', async () => {
      passwordTokens.changePassword.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );
      await expect(
        service.changeUserPassword(activeUserInOrgA.id, {
          currentPassword: 'wrong',
          newPassword: reset.newPassword,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(emailService.send).not.toHaveBeenCalled();
    });
    it('sets password through the invite lifecycle', async () => {
      usersService.findByOrgAndEmail.mockResolvedValue({
        ...activeUserInOrgA,
        passwordHash: null,
      });
      await expect(service.setUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
      expect(passwordTokens.replacePasswordFromToken).toHaveBeenCalledWith({
        principal,
        email: reset.email,
        purpose: PasswordTokenPurpose.INVITE,
        token: reset.token,
        newPassword: reset.newPassword,
      });
    });
    it('rejects invite when a password is already set', async () => {
      await expect(service.setUserPassword(reset)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(passwordTokens.replacePasswordFromToken).not.toHaveBeenCalled();
    });
    it('forgot returns ok and preserves the reset link', async () => {
      await expect(service.forgotUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
      expect(passwordTokens.issueToken).toHaveBeenCalledWith(
        expect.objectContaining({
          principal,
          purpose: PasswordTokenPurpose.RESET,
        }),
      );
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Reset your Speeko password',
          html: expect.stringContaining('raw-token-value-32b'),
        }),
      );
    });
    it('forgot reissues invite for a user without a password', async () => {
      usersService.findByOrgAndEmail.mockResolvedValue({
        ...activeUserInOrgA,
        passwordHash: null,
      });
      await service.forgotUserPassword(reset);
      expect(passwordTokens.issueToken).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: PasswordTokenPurpose.INVITE }),
      );
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Set your Speeko password' }),
      );
    });
    it('does not disclose a missing account', async () => {
      usersService.findByOrgAndEmail.mockResolvedValue(null);
      await expect(service.forgotUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
      expect(passwordTokens.issueToken).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
    it('does not disclose eligibility changes while issuance waits for the lock', async () => {
      passwordTokens.issueToken.mockRejectedValue(
        new BadRequestException('Invalid or expired reset link'),
      );
      await expect(service.forgotUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
      await expect(
        service.forgotAdminPassword(activeAdmin.email),
      ).resolves.toEqual({ ok: true });
      expect(emailService.send).not.toHaveBeenCalled();
    });
    it('resets through one lifecycle operation', async () => {
      await expect(service.resetUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
      expect(passwordTokens.replacePasswordFromToken).toHaveBeenCalledWith({
        principal,
        email: reset.email,
        purpose: PasswordTokenPurpose.RESET,
        token: reset.token,
        newPassword: reset.newPassword,
      });
    });
    it('does not email when consumption fails', async () => {
      passwordTokens.replacePasswordFromToken.mockRejectedValue(
        new BadRequestException('Invalid or expired reset link'),
      );
      await expect(service.resetUserPassword(reset)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(emailService.send).not.toHaveBeenCalled();
    });
    it('email failure preserves a committed reset response', async () => {
      emailService.send.mockResolvedValue({
        ok: false,
        skipped: true,
        error: 'email disabled',
      });
      await expect(service.resetUserPassword(reset)).resolves.toEqual({
        ok: true,
      });
    });
    it('admin reset and change use a distinct admin principal', async () => {
      await service.resetAdminPassword({
        email: activeAdmin.email,
        token: reset.token,
        newPassword: reset.newPassword,
      });
      expect(passwordTokens.replacePasswordFromToken).toHaveBeenCalledWith(
        expect.objectContaining({
          principal: { kind: PasswordTokenKind.ADMIN, id: activeAdmin.id },
        }),
      );
      await service.changeAdminPassword(activeAdmin.id, {
        currentPassword: 'old',
        newPassword: reset.newPassword,
      });
      expect(passwordTokens.changePassword).toHaveBeenCalledWith(
        expect.objectContaining({
          principal: { kind: PasswordTokenKind.ADMIN, id: activeAdmin.id },
        }),
      );
    });
    it('invite succeeds with disabled email', async () => {
      emailService.send.mockResolvedValue({
        ok: false,
        skipped: true,
        error: 'email disabled',
      });
      await expect(
        service.sendUserInvite(activeUserInOrgA as never, orgA),
      ).resolves.toBeUndefined();
      expect(passwordTokens.issueToken).toHaveBeenCalled();
    });
  });
});

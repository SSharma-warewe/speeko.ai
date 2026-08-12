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
import { AuthService } from '../auth.service';

jest.mock('../../common/password.util', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  verifyPassword: jest.fn(),
}));

import { verifyPassword } from '../../common/password.util';

const verifyPasswordMock = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;

describe('AuthService', () => {
  let service: AuthService;
  let adminsService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
  };
  let usersService: {
    findByOrgAndEmail: jest.Mock;
    findById: jest.Mock;
  };
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
    };
    usersService = {
      findByOrgAndEmail: jest.fn(),
      findById: jest.fn(),
    };
    organizationsService = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('test.jwt.token'),
    };
    configService = {
      get: jest.fn().mockReturnValue('8h'),
    };
    verifyPasswordMock.mockReset();
    verifyPasswordMock.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AdminsService, useValue: adminsService },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
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
      const payload = jwtService.sign.mock.calls[0][0] as Record<string, unknown>;
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
        typ: 'user',
      });
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('password_hash');
      expect(JSON.stringify(profile)).not.toContain(
        activeUserInOrgA.passwordHash,
      );
    });
  });
});

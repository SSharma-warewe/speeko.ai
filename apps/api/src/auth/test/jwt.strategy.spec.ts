import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminsService } from '../../admins/admins.service';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/user.entity';
import { JwtStrategy } from '../jwt.strategy';
import { JwtPayload } from '../auth.types';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let adminsService: { findById: jest.Mock };
  let usersService: { findById: jest.Mock };

  const activeAdmin = {
    id: 'admin-id',
    email: 'admin@local.dev',
    name: 'Platform Admin',
    isActive: true,
  };

  const activeUser = {
    id: 'user-id',
    email: 'agent@acme.com',
    name: 'Agent A',
    organizationId: 'org-a-id',
    role: UserRole.ORG_ADMIN,
    isActive: true,
    organization: {
      id: 'org-a-id',
      name: 'Org A',
      slug: 'org-a',
      isActive: true,
    },
  };

  beforeEach(() => {
    adminsService = { findById: jest.fn() };
    usersService = { findById: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(
      config,
      adminsService as unknown as AdminsService,
      usersService as unknown as UsersService,
    );
  });

  it('maps admin payload via DB row (not stale claims)', async () => {
    adminsService.findById.mockResolvedValue(activeAdmin);

    await expect(
      strategy.validate({
        sub: 'admin-id',
        typ: 'admin',
        email: 'stale@old.dev',
      }),
    ).resolves.toEqual({
      id: 'admin-id',
      email: 'admin@local.dev',
      name: 'Platform Admin',
      typ: 'admin',
    });
  });

  it('maps user payload via DB row (orgId/role from DB)', async () => {
    usersService.findById.mockResolvedValue(activeUser);

    await expect(
      strategy.validate({
        sub: 'user-id',
        typ: 'user',
        email: 'stale@acme.com',
        orgId: 'wrong-org',
        role: 'agent',
      }),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'agent@acme.com',
      name: 'Agent A',
      typ: 'user',
      orgId: 'org-a-id',
      role: UserRole.ORG_ADMIN,
    });
  });

  it('rejects missing sub', async () => {
    await expect(
      strategy.validate({
        typ: 'admin',
        email: 'admin@local.dev',
      } as JwtPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing typ', async () => {
    await expect(
      strategy.validate({
        sub: 'id',
        email: 'admin@local.dev',
      } as JwtPayload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive admin even with valid JWT payload', async () => {
    adminsService.findById.mockResolvedValue({
      ...activeAdmin,
      isActive: false,
    });

    await expect(
      strategy.validate({
        sub: 'admin-id',
        typ: 'admin',
        email: activeAdmin.email,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing admin', async () => {
    adminsService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'admin-id',
        typ: 'admin',
        email: activeAdmin.email,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive user even with valid JWT payload', async () => {
    usersService.findById.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        typ: 'user',
        email: activeUser.email,
        orgId: activeUser.organizationId,
        role: activeUser.role,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects user when organization is inactive', async () => {
    usersService.findById.mockResolvedValue({
      ...activeUser,
      organization: { ...activeUser.organization, isActive: false },
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        typ: 'user',
        email: activeUser.email,
        orgId: activeUser.organizationId,
        role: activeUser.role,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects user when organization relation is missing', async () => {
    usersService.findById.mockResolvedValue({
      ...activeUser,
      organization: null,
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        typ: 'user',
        email: activeUser.email,
        orgId: activeUser.organizationId,
        role: activeUser.role,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown token type', async () => {
    await expect(
      strategy.validate({
        sub: 'id',
        typ: 'bot' as JwtPayload['typ'],
        email: 'x@y.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

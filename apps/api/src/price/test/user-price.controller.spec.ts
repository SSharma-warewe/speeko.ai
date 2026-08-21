import { ForbiddenException } from '@nestjs/common';
import type { AuthPrincipal } from '../../auth/auth.types';
import { UserPriceController } from '../user-price.controller';

describe('UserPriceController', () => {
  const orgUser: AuthPrincipal = {
    id: 'user-1',
    email: 'ops@acme.com',
    name: 'Ops',
    typ: 'user',
    orgId: 'org-a',
    role: 'org_admin',
  };

  it('scopes summary to JWT orgId', async () => {
    const priceService = {
      summary: jest.fn().mockResolvedValue({ totalUsd: 1.25 }),
    };
    const controller = new UserPriceController(
      priceService as never,
    );

    await controller.summary(orgUser, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
    });

    expect(priceService.summary).toHaveBeenCalledWith({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-01-31T00:00:00.000Z'),
      organizationId: 'org-a',
    });
  });

  it('rejects non-user principals', () => {
    const controller = new UserPriceController({
      summary: jest.fn(),
    } as never);
    const admin: AuthPrincipal = {
      id: 'admin-1',
      email: 'admin@local.dev',
      name: null,
      typ: 'admin',
    };

    expect(() => controller.summary(admin, {})).toThrow(ForbiddenException);
  });
});

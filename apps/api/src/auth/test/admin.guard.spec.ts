import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from '../guards/admin.guard';
import { createMockExecutionContext } from './helpers/mock-execution-context';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows admin principals', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'admin-id',
        email: 'admin@local.dev',
        name: null,
        typ: 'admin',
      },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('10. rejects user tokens', () => {
    const ctx = createMockExecutionContext({
      user: {
        id: 'user-id',
        email: 'agent@acme.com',
        name: null,
        typ: 'user',
        orgId: 'org-a-id',
        role: 'org_admin',
      },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Admin access required');
  });

  it('rejects missing request user', () => {
    const ctx = createMockExecutionContext({});

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

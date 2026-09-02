import { ForbiddenException } from '@nestjs/common';
import { orgIdFrom } from '../org-id';
import type { AuthPrincipal } from '../auth.types';

describe('orgIdFrom', () => {
  it('returns orgId for an org user principal', () => {
    const principal: AuthPrincipal = {
      id: 'user-1',
      email: 'ops@acme.com',
      name: 'Ops',
      typ: 'user',
      orgId: 'org-a',
      role: 'org_admin',
    };
    expect(orgIdFrom(principal)).toBe('org-a');
  });

  it('rejects admin principals', () => {
    const principal: AuthPrincipal = {
      id: 'admin-1',
      email: 'admin@local.dev',
      name: null,
      typ: 'admin',
    };
    expect(() => orgIdFrom(principal)).toThrow(ForbiddenException);
    expect(() => orgIdFrom(principal)).toThrow(
      'Organization user access required',
    );
  });
});

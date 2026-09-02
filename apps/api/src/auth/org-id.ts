import { ForbiddenException } from '@nestjs/common';
import { AuthPrincipal } from './auth.types';

export function orgIdFrom(principal: AuthPrincipal): string {
  if (principal.typ !== 'user' || !principal.orgId) {
    throw new ForbiddenException('Organization user access required');
  }
  return principal.orgId;
}

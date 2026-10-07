import { PasswordTokenKind } from './password-reset-token.entity';

export type PasswordPrincipal =
  | { kind: PasswordTokenKind.USER; id: string; organizationId: string }
  | { kind: PasswordTokenKind.ADMIN; id: string };

export const INVALID_PASSWORD_LINK = 'Invalid or expired reset link';

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../common/password.util';
import { PasswordTokenPurpose } from './password-reset-token.entity';
import { PasswordPrincipal } from './password-lifecycle.types';
import { PasswordLifecycleRepository } from './password-lifecycle.repository';

export function hashPasswordToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class PasswordLifecycleService {
  constructor(private readonly repository: PasswordLifecycleRepository) {}

  async issueToken(input: {
    principal: PasswordPrincipal;
    purpose: PasswordTokenPurpose;
    ttlMs: number;
  }): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.repository.issue({
      ...input,
      tokenHash: hashPasswordToken(raw),
    });
    return raw;
  }

  async replacePasswordFromToken(input: {
    principal: PasswordPrincipal;
    email: string;
    purpose: PasswordTokenPurpose;
    token: string;
    newPassword: string;
  }): Promise<void> {
    const passwordHash = await hashPassword(input.newPassword);
    await this.repository.consumeAndReplace({
      principal: input.principal,
      email: input.email,
      purpose: input.purpose,
      tokenHash: hashPasswordToken(input.token),
      passwordHash,
    });
  }

  async changePassword(input: {
    principal: PasswordPrincipal;
    email: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const verifiedHash = await this.repository.passwordHash(input.principal);
    if (
      !verifiedHash ||
      !(await verifyPassword(input.currentPassword, verifiedHash))
    )
      throw new UnauthorizedException('Invalid credentials');
    if (input.currentPassword === input.newPassword)
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    const passwordHash = await hashPassword(input.newPassword);
    await this.repository.replaceVerified({
      principal: input.principal,
      email: input.email,
      verifiedHash,
      passwordHash,
    });
  }
}

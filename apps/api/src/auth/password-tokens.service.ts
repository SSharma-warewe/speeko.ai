import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  PasswordResetToken,
  PasswordTokenKind,
  PasswordTokenPurpose,
} from './password-reset-token.entity';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';

export function hashPasswordToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class PasswordTokensService {
  constructor(
    private readonly tokensRepository: PasswordResetTokensRepository,
  ) {}

  async issueUserToken(params: {
    userId: string;
    purpose: PasswordTokenPurpose;
    ttlMs: number;
  }): Promise<string> {
    await this.tokensRepository.invalidateUnusedForUser(params.userId);
    return this.persist({
      kind: PasswordTokenKind.USER,
      purpose: params.purpose,
      userId: params.userId,
      adminId: null,
      ttlMs: params.ttlMs,
    });
  }

  async issueAdminToken(params: {
    adminId: string;
    purpose: PasswordTokenPurpose;
    ttlMs: number;
  }): Promise<string> {
    await this.tokensRepository.invalidateUnusedForAdmin(params.adminId);
    return this.persist({
      kind: PasswordTokenKind.ADMIN,
      purpose: params.purpose,
      userId: null,
      adminId: params.adminId,
      ttlMs: params.ttlMs,
    });
  }

  async findValid(params: {
    rawToken: string;
    kind: PasswordTokenKind;
    purpose: PasswordTokenPurpose;
    now?: Date;
  }): Promise<PasswordResetToken | null> {
    const tokenHash = hashPasswordToken(params.rawToken);
    const row = await this.tokensRepository.findByTokenHash(tokenHash);
    if (!row || row.usedAt) {
      return null;
    }
    if (row.kind !== params.kind || row.purpose !== params.purpose) {
      return null;
    }
    const now = params.now ?? new Date();
    if (row.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    return row;
  }

  async markUsed(token: PasswordResetToken, now = new Date()): Promise<void> {
    token.usedAt = now;
    await this.tokensRepository.save(token);
  }

  invalidateForUser(userId: string): Promise<void> {
    return this.tokensRepository.invalidateUnusedForUser(userId);
  }

  invalidateForAdmin(adminId: string): Promise<void> {
    return this.tokensRepository.invalidateUnusedForAdmin(adminId);
  }

  private async persist(params: {
    kind: PasswordTokenKind;
    purpose: PasswordTokenPurpose;
    userId: string | null;
    adminId: string | null;
    ttlMs: number;
  }): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    const entity = this.tokensRepository.create({
      kind: params.kind,
      purpose: params.purpose,
      userId: params.userId,
      adminId: params.adminId,
      tokenHash: hashPasswordToken(raw),
      expiresAt: new Date(Date.now() + params.ttlMs),
      usedAt: null,
    });
    await this.tokensRepository.save(entity);
    return raw;
  }
}

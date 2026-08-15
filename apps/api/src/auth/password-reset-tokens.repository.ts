import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import { PasswordResetToken } from './password-reset-token.entity';

@Injectable()
export class PasswordResetTokensRepository {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly repo: Repository<PasswordResetToken>,
  ) {}

  create(data: DeepPartial<PasswordResetToken>): PasswordResetToken {
    return this.repo.create(data);
  }

  save(token: PasswordResetToken): Promise<PasswordResetToken> {
    return this.repo.save(token);
  }

  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  async invalidateUnusedForUser(userId: string, now = new Date()): Promise<void> {
    await this.repo.update(
      { userId, usedAt: IsNull() },
      { usedAt: now },
    );
  }

  async invalidateUnusedForAdmin(
    adminId: string,
    now = new Date(),
  ): Promise<void> {
    await this.repo.update(
      { adminId, usedAt: IsNull() },
      { usedAt: now },
    );
  }
}

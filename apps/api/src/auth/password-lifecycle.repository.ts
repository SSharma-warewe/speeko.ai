import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Admin } from '../admins/admin.entity';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { normalizeEmail } from '../common/password.util';
import {
  PasswordResetToken,
  PasswordTokenKind,
  PasswordTokenPurpose,
} from './password-reset-token.entity';
import {
  INVALID_PASSWORD_LINK,
  PasswordPrincipal,
} from './password-lifecycle.types';

/** All password mutations serialize on the principal before touching tokens. */
@Injectable()
export class PasswordLifecycleRepository {
  constructor(private readonly db: DataSource) {}

  async passwordHash(principal: PasswordPrincipal): Promise<string | null> {
    const row =
      principal.kind === PasswordTokenKind.USER
        ? await this.db.getRepository(User).findOneBy({
            id: principal.id,
            organizationId: principal.organizationId,
          })
        : await this.db.getRepository(Admin).findOneBy({ id: principal.id });
    return row?.passwordHash ?? null;
  }

  async issue(input: {
    principal: PasswordPrincipal;
    purpose: PasswordTokenPurpose;
    tokenHash: string;
    ttlMs: number;
  }) {
    await this.db.transaction(async (manager) => {
      await this.lockedPrincipal(manager, input.principal);
      if (
        input.principal.kind === PasswordTokenKind.ADMIN &&
        input.purpose !== PasswordTokenPurpose.RESET
      )
        throw new BadRequestException(INVALID_PASSWORD_LINK);
      const now = new Date();
      await this.invalidate(manager, input.principal, now);
      await manager.save(
        PasswordResetToken,
        manager.create(PasswordResetToken, {
          kind: input.principal.kind,
          purpose: input.purpose,
          userId:
            input.principal.kind === PasswordTokenKind.USER
              ? input.principal.id
              : null,
          adminId:
            input.principal.kind === PasswordTokenKind.ADMIN
              ? input.principal.id
              : null,
          tokenHash: input.tokenHash,
          expiresAt: new Date(now.getTime() + input.ttlMs),
          usedAt: null,
        }),
      );
    });
  }

  async consumeAndReplace(input: {
    principal: PasswordPrincipal;
    email: string;
    purpose: PasswordTokenPurpose;
    tokenHash: string;
    passwordHash: string;
  }) {
    await this.db.transaction(async (manager) => {
      const row = await this.lockedPrincipal(
        manager,
        input.principal,
        input.email,
      );
      const now = new Date();
      const token = await manager.findOneBy(PasswordResetToken, {
        tokenHash: input.tokenHash,
      });
      const isUser = input.principal.kind === PasswordTokenKind.USER;
      if (
        !token ||
        token.usedAt ||
        token.expiresAt <= now ||
        token.kind !== input.principal.kind ||
        token.purpose !== input.purpose ||
        token.userId !== (isUser ? input.principal.id : null) ||
        token.adminId !== (isUser ? null : input.principal.id) ||
        (input.purpose === PasswordTokenPurpose.INVITE
          ? !isUser || !!row.passwordHash
          : !row.passwordHash)
      )
        throw new BadRequestException(INVALID_PASSWORD_LINK);
      await manager.update(isUser ? User : Admin, row.id, {
        passwordHash: input.passwordHash,
      });
      await manager.update(PasswordResetToken, token.id, { usedAt: now });
      await this.invalidate(manager, input.principal, now);
    });
  }

  async replaceVerified(input: {
    principal: PasswordPrincipal;
    email: string;
    verifiedHash: string;
    passwordHash: string;
  }) {
    await this.db.transaction(async (manager) => {
      let row: User | Admin;
      try {
        row = await this.lockedPrincipal(manager, input.principal, input.email);
      } catch (error) {
        if (error instanceof BadRequestException)
          throw new UnauthorizedException('Invalid credentials');
        throw error;
      }
      if (row.passwordHash !== input.verifiedHash)
        throw new UnauthorizedException('Invalid credentials');
      await manager.update(
        input.principal.kind === PasswordTokenKind.USER ? User : Admin,
        row.id,
        { passwordHash: input.passwordHash },
      );
      await this.invalidate(manager, input.principal, new Date());
    });
  }

  private async lockedPrincipal(
    manager: EntityManager,
    principal: PasswordPrincipal,
    email?: string,
  ): Promise<User | Admin> {
    const row =
      principal.kind === PasswordTokenKind.USER
        ? await manager.findOne(User, {
            where: { id: principal.id },
            lock: { mode: 'pessimistic_write' },
          })
        : await manager.findOne(Admin, {
            where: { id: principal.id },
            lock: { mode: 'pessimistic_write' },
          });
    if (
      !row?.isActive ||
      (email !== undefined &&
        normalizeEmail(row.email) !== normalizeEmail(email))
    )
      throw new BadRequestException(INVALID_PASSWORD_LINK);
    if (principal.kind === PasswordTokenKind.USER) {
      if ((row as User).organizationId !== principal.organizationId)
        throw new BadRequestException(INVALID_PASSWORD_LINK);
      const org = await manager.findOneBy(Organization, {
        id: principal.organizationId,
      });
      if (!org?.isActive) throw new BadRequestException(INVALID_PASSWORD_LINK);
    }
    return row;
  }

  private invalidate(
    manager: EntityManager,
    principal: PasswordPrincipal,
    now: Date,
  ) {
    return manager.update(
      PasswordResetToken,
      principal.kind === PasswordTokenKind.USER
        ? { userId: principal.id, usedAt: IsNull() }
        : { adminId: principal.id, usedAt: IsNull() },
      { usedAt: now },
    );
  }
}

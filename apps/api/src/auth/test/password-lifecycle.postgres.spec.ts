import { randomUUID } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { PasswordLifecycleRepository } from '../password-lifecycle.repository';
import {
  PasswordLifecycleService,
  hashPasswordToken,
} from '../password-lifecycle.service';
import {
  PasswordTokenKind,
  PasswordTokenPurpose,
  PasswordResetToken,
} from '../password-reset-token.entity';
import { Organization } from '../../organizations/organization.entity';
import { User } from '../../users/user.entity';
import { Admin } from '../../admins/admin.entity';
import { PasswordPrincipal } from '../password-lifecycle.types';
import {
  securityDatabase,
  securityDatabaseUrl,
  waitForPrincipalWaiters,
} from '../../common/test/api-security-database';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';
import { verifyPassword } from '../../common/password.util';
import { UsersService } from '../../users/users.service';
import { UsersRepository } from '../../users/users.repository';
import { AdminsService } from '../../admins/admins.service';
import { AdminsRepository } from '../../admins/admins.repository';

(securityDatabaseUrl ? describe : describe.skip)(
  'Atomic passwords with isolated PostgreSQL',
  () => {
    let db: DataSource, replica: DataSource;
    let repository: PasswordLifecycleRepository,
      other: PasswordLifecycleRepository;
    const orgId = randomUUID(),
      foreignOrgId = randomUUID(),
      id = randomUUID();
    const user: PasswordPrincipal = {
      kind: PasswordTokenKind.USER,
      id,
      organizationId: orgId,
    };
    const admin: PasswordPrincipal = { kind: PasswordTokenKind.ADMIN, id };
    const email = 'security@example.invalid';
    const oldHash = 'fixture-original-hash',
      newHash = 'fixture-replacement-hash';
    const raw = 'fixture-token';
    const replace = (
      principal: PasswordPrincipal = user,
      token = raw,
      purpose = PasswordTokenPurpose.RESET,
    ) => ({
      principal,
      email,
      tokenHash: hashPasswordToken(token),
      purpose,
      passwordHash: newHash,
    });
    beforeAll(async () => {
      const fixture = await securityDatabase('auth_security_test');
      db = fixture.db;
      replica = await fixture.connect();
      repository = new PasswordLifecycleRepository(db);
      other = new PasswordLifecycleRepository(replica);
    }, 60000);
    afterAll(async () => {
      if (replica?.isInitialized) await replica.destroy();
      if (db?.isInitialized) await db.destroy();
    });
    beforeEach(async () => {
      await db.query(
        'TRUNCATE password_reset_tokens, users, admins, organizations CASCADE',
      );
      await db.getRepository(Organization).save([
        { id: orgId, name: 'Security A', slug: 'security-a', isActive: true },
        {
          id: foreignOrgId,
          name: 'Security B',
          slug: 'security-b',
          isActive: true,
        },
      ]);
      await db.getRepository(User).save({
        id,
        organizationId: orgId,
        email,
        passwordHash: oldHash,
        isActive: true,
      });
      await db
        .getRepository(Admin)
        .save({ id, email, passwordHash: oldHash, isActive: true });
      await repository.issue({
        principal: user,
        purpose: PasswordTokenPurpose.RESET,
        tokenHash: hashPasswordToken(raw),
        ttlMs: 60000,
      });
    });

    async function contend(
      actions: Array<() => Promise<unknown>>,
      principal: PasswordPrincipal = user,
      beforeUnlock?: () => Promise<void>,
    ) {
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        if (principal.kind === PasswordTokenKind.USER)
          await blocker.manager.findOne(User, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
        else
          await blocker.manager.findOne(Admin, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });
        pending = Promise.allSettled(actions.map((action) => action()));
        await waitForPrincipalWaiters(db, actions.length);
        if (beforeUnlock) await beforeUnlock();
        await blocker.commitTransaction();
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
        if (pending) await pending;
      }
      return pending!;
    }

    it.each(['user', 'admin'])(
      'permits one concurrent consumption for %s',
      async (kind) => {
        const principal = kind === 'user' ? user : admin;
        if (kind === 'admin')
          await repository.issue({
            principal,
            purpose: PasswordTokenPurpose.RESET,
            tokenHash: hashPasswordToken('admin-token'),
            ttlMs: 60000,
          });
        const input = replace(principal, kind === 'user' ? raw : 'admin-token');
        const results = await contend(
          [
            () => repository.consumeAndReplace(input),
            () => other.consumeAndReplace(input),
          ],
          principal,
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
        const row =
          kind === 'user'
            ? await db.getRepository(User).findOneByOrFail({ id })
            : await db.getRepository(Admin).findOneByOrFail({ id });
        expect(row.passwordHash).toBe(newHash);
        expect(
          (
            await db
              .getRepository(PasswordResetToken)
              .findOneByOrFail({ tokenHash: input.tokenHash })
          ).usedAt,
        ).not.toBeNull();
      },
    );

    it('serializes different sibling tokens on the same principal', async () => {
      await db.getRepository(PasswordResetToken).save({
        kind: PasswordTokenKind.USER,
        purpose: PasswordTokenPurpose.RESET,
        userId: id,
        adminId: null,
        tokenHash: hashPasswordToken('sibling'),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      const results = await contend([
        () => repository.consumeAndReplace(replace()),
        () => other.consumeAndReplace(replace(user, 'sibling')),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await db
          .getRepository(PasswordResetToken)
          .countBy({ userId: id, usedAt: IsNull() }),
      ).toBe(0);
    });

    it('leaves only the last concurrent replacement token usable', async () => {
      const services = [
        new PasswordLifecycleService(repository),
        new PasswordLifecycleService(other),
      ];
      const results = await contend(
        services.map(
          (service) => () =>
            service.issueToken({
              principal: user,
              purpose: PasswordTokenPurpose.RESET,
              ttlMs: 60000,
            }),
        ),
      );
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const valid = await db
        .getRepository(PasswordResetToken)
        .findBy({ userId: id, usedAt: IsNull() });
      expect(valid).toHaveLength(1);
      const issued = results.map((r) =>
        hashPasswordToken((r as PromiseFulfilledResult<string>).value),
      );
      expect(issued).toContain(valid[0].tokenHash);
    });

    it('rolls back sibling invalidation when replacement token insertion fails', async () => {
      await expect(
        repository.issue({
          principal: user,
          purpose: PasswordTokenPurpose.RESET,
          tokenHash: hashPasswordToken(raw),
          ttlMs: 60000,
        }),
      ).rejects.toThrow();
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken(raw) })
        ).usedAt,
      ).toBeNull();
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
    });

    it('serializes issuance against consumption without partial state', async () => {
      const results = await contend([
        () => repository.consumeAndReplace(replace()),
        () =>
          other.issue({
            principal: user,
            purpose: PasswordTokenPurpose.RESET,
            tokenHash: hashPasswordToken('replacement'),
            ttlMs: 60000,
          }),
      ]);
      expect(results[1].status).toBe('fulfilled');
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(results[0].status === 'fulfilled' ? newHash : oldHash);
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken(raw) })
        ).usedAt,
      ).not.toBeNull();
      expect(
        await db
          .getRepository(PasswordResetToken)
          .countBy({ userId: id, usedAt: IsNull() }),
      ).toBe(1);
    });

    it('rejects stale authenticated changes racing with reset', async () => {
      const results = await contend([
        () => repository.consumeAndReplace(replace()),
        () =>
          other.replaceVerified({
            principal: user,
            email,
            verifiedHash: oldHash,
            passwordHash: 'changed-hash',
          }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await db
          .getRepository(PasswordResetToken)
          .countBy({ userId: id, usedAt: IsNull() }),
      ).toBe(0);
    });

    it('evaluates token expiry after acquiring the lock', async () => {
      const results = await contend(
        [() => repository.consumeAndReplace(replace())],
        user,
        async () => {
          await replica
            .getRepository(PasswordResetToken)
            .update(
              { tokenHash: hashPasswordToken(raw) },
              { expiresAt: new Date(0) },
            );
        },
      );
      expect(results[0].status).toBe('rejected');
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
    });

    it('rolls back password and token writes if token persistence fails', async () => {
      await db.query(
        `CREATE OR REPLACE FUNCTION reject_token_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture token update failure'; END $$`,
      );
      await db.query(
        `CREATE TRIGGER reject_token_update BEFORE UPDATE ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION reject_token_update()`,
      );
      try {
        await expect(repository.consumeAndReplace(replace())).rejects.toThrow(
          'fixture token update failure',
        );
      } finally {
        await db.query(
          'DROP TRIGGER reject_token_update ON password_reset_tokens',
        );
        await db.query('DROP FUNCTION reject_token_update()');
      }
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken(raw) })
        ).usedAt,
      ).toBeNull();
    });

    it.each([
      'used',
      'expired',
      'purpose',
      'kind',
      'owner',
      'organization',
      'email',
      'inactive-user',
      'inactive-org',
    ])('rejects invalid reset: %s', async (reason) => {
      const input = replace();
      const tokens = db.getRepository(PasswordResetToken);
      if (reason === 'used')
        await tokens.update(
          { tokenHash: input.tokenHash },
          { usedAt: new Date() },
        );
      if (reason === 'expired')
        await tokens.update(
          { tokenHash: input.tokenHash },
          { expiresAt: new Date(0) },
        );
      if (reason === 'purpose') input.purpose = PasswordTokenPurpose.INVITE;
      if (reason === 'kind') input.principal = admin;
      if (reason === 'owner') {
        input.principal = {
          kind: PasswordTokenKind.USER,
          id: randomUUID(),
          organizationId: orgId,
        };
        input.email = 'other@example.invalid';
        await db
          .getRepository(User)
          .save({
            id: input.principal.id,
            organizationId: orgId,
            email: input.email,
            passwordHash: oldHash,
            isActive: true,
          });
      }
      if (reason === 'organization')
        input.principal = {
          kind: PasswordTokenKind.USER,
          id,
          organizationId: foreignOrgId,
        };
      if (reason === 'email') input.email = 'other@example.invalid';
      if (reason === 'inactive-user')
        await db.getRepository(User).update(id, { isActive: false });
      if (reason === 'inactive-org')
        await db.getRepository(Organization).update(orgId, { isActive: false });
      await expect(repository.consumeAndReplace(input)).rejects.toThrow(
        'Invalid or expired reset link',
      );
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
      expect(
        (await db.getRepository(Admin).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
    });

    it('sets an invite once and never overwrites an already-set password', async () => {
      await db.getRepository(User).update(id, { passwordHash: null });
      await repository.issue({
        principal: user,
        purpose: PasswordTokenPurpose.INVITE,
        tokenHash: hashPasswordToken('invite'),
        ttlMs: 60000,
      });
      await repository.consumeAndReplace(
        replace(user, 'invite', PasswordTokenPurpose.INVITE),
      );
      await expect(
        other.consumeAndReplace(
          replace(user, 'invite', PasswordTokenPurpose.INVITE),
        ),
      ).rejects.toThrow('Invalid or expired');
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(newHash);
    });

    it('rejects an unused invite when the password was already set', async () => {
      await db.getRepository(User).update(id, { passwordHash: null });
      await repository.issue({
        principal: user,
        purpose: PasswordTokenPurpose.INVITE,
        tokenHash: hashPasswordToken('invite'),
        ttlMs: 60000,
      });
      await db.getRepository(User).update(id, { passwordHash: oldHash });
      await expect(
        repository.consumeAndReplace(
          replace(user, 'invite', PasswordTokenPurpose.INVITE),
        ),
      ).rejects.toThrow('Invalid or expired');
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken('invite') })
        ).usedAt,
      ).toBeNull();
    });

    it.each(['user', 'admin'])(
      'does not restore a stale password during a %s profile update',
      async (kind) => {
        if (kind === 'user') {
          const repo = new UsersRepository(db.getRepository(User));
          const stale = await repo.findByIdWithOrganization(id);
          jest.spyOn(repo, 'findByIdWithOrganization').mockResolvedValue(stale);
          await repository.consumeAndReplace(replace());
          await new UsersService(repo, {} as never, {} as never).updateName(
            id,
            'Updated name',
          );
          expect(
            (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
          ).toBe(newHash);
        } else {
          const repo = new AdminsRepository(db.getRepository(Admin));
          const stale = await repo.findById(id);
          jest.spyOn(repo, 'findById').mockResolvedValue(stale);
          await repository.issue({
            principal: admin,
            purpose: PasswordTokenPurpose.RESET,
            tokenHash: hashPasswordToken('admin-token'),
            ttlMs: 60000,
          });
          await repository.consumeAndReplace(replace(admin, 'admin-token'));
          await new AdminsService(repo).updateName(id, 'Updated name');
          expect(
            (await db.getRepository(Admin).findOneByOrFail({ id }))
              .passwordHash,
          ).toBe(newHash);
        }
      },
    );

    it('rejects inactive admin issuance, consumption, and authenticated changes', async () => {
      await repository.issue({
        principal: admin,
        purpose: PasswordTokenPurpose.RESET,
        tokenHash: hashPasswordToken('admin-token'),
        ttlMs: 60000,
      });
      await db.getRepository(Admin).update(id, { isActive: false });
      await expect(
        repository.issue({
          principal: admin,
          purpose: PasswordTokenPurpose.RESET,
          tokenHash: hashPasswordToken('another'),
          ttlMs: 60000,
        }),
      ).rejects.toThrow('Invalid or expired');
      await expect(
        repository.consumeAndReplace(replace(admin, 'admin-token')),
      ).rejects.toThrow('Invalid or expired');
      await expect(
        repository.replaceVerified({
          principal: admin,
          email,
          verifiedHash: oldHash,
          passwordHash: newHash,
        }),
      ).rejects.toThrow('Invalid credentials');
    });

    function authWithEmail(send: jest.Mock) {
      return new AuthService(
        {} as never,
        {
          findByOrgAndEmail: () => db.getRepository(User).findOneBy({ id }),
        } as never,
        {
          findBySlug: () =>
            db.getRepository(Organization).findOneBy({ id: orgId }),
        } as never,
        {} as never,
        new ConfigService(),
        { send } as never,
        new PasswordLifecycleService(repository),
        {} as never,
      );
    }
    const resetRequest = {
      email,
      organizationSlug: 'security-a',
      token: raw,
      newPassword: 'FixtureNewPassword123!',
    };

    it('sends no success email when the real lifecycle transaction fails', async () => {
      const send = jest.fn();
      await db.query(
        `CREATE OR REPLACE FUNCTION reject_token_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture token update failure'; END $$`,
      );
      await db.query(
        `CREATE TRIGGER reject_token_update BEFORE UPDATE ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION reject_token_update()`,
      );
      try {
        await expect(
          authWithEmail(send).resetUserPassword(resetRequest),
        ).rejects.toThrow('fixture token update failure');
      } finally {
        await db.query(
          'DROP TRIGGER reject_token_update ON password_reset_tokens',
        );
        await db.query('DROP FUNCTION reject_token_update()');
      }
      expect(send).not.toHaveBeenCalled();
      expect(
        (await db.getRepository(User).findOneByOrFail({ id })).passwordHash,
      ).toBe(oldHash);
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken(raw) })
        ).usedAt,
      ).toBeNull();
    });

    it('keeps the committed password when notification delivery fails', async () => {
      const send = jest.fn(async () => {
        const committed = await db.getRepository(User).findOneByOrFail({ id });
        expect(
          await verifyPassword(
            resetRequest.newPassword,
            committed.passwordHash!,
          ),
        ).toBe(true);
        return { ok: false, skipped: true, error: 'fixture email disabled' };
      });
      await expect(
        authWithEmail(send).resetUserPassword(resetRequest),
      ).resolves.toEqual({ ok: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        (
          await db
            .getRepository(PasswordResetToken)
            .findOneByOrFail({ tokenHash: hashPasswordToken(raw) })
        ).usedAt,
      ).not.toBeNull();
    });
  },
);

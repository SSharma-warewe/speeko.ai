import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError } from 'typeorm';
import { randomUUID } from 'node:crypto';
import type { AuthOrgUser } from '../auth/auth.types';
import type { CreateHumanCallRequest } from '@call-agent/contracts';
import { User } from '../users/user.entity';
import { Call } from './call.entity';
import { HumanCallSession } from './human-call-session.entity';

@Injectable()
export class HumanCallSessionsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findRequest(orgId: string, requestId: string) {
    return this.db.getRepository(HumanCallSession).findOne({
      where: { organizationId: orgId, requestId },
      relations: { call: true },
    });
  }
  findActive(userId: string, orgId: string) {
    return this.db.getRepository(HumanCallSession).findOne({
      where: { userId, organizationId: orgId, finishedAt: IsNull() },
      relations: { call: true },
    });
  }
  find(id: string) {
    return this.db
      .getRepository(HumanCallSession)
      .findOne({ where: { id }, relations: { call: true } });
  }
  async owned(callId: string, actor: AuthOrgUser) {
    const session = await this.db.getRepository(HumanCallSession).findOne({
      where: { callId, userId: actor.id, organizationId: actor.orgId },
      relations: { call: true },
    });
    if (!session) throw new NotFoundException('Human call not found');
    return session;
  }
  async actorActive(session: HumanCallSession): Promise<boolean> {
    if (!session.userId) return false;
    const user = await this.db.getRepository(User).findOne({
      where: {
        id: session.userId,
        organizationId: session.organizationId,
        isActive: true,
      },
      relations: { organization: true },
    });
    return user?.organization?.isActive === true;
  }

  async create(
    actor: AuthOrgUser,
    request: CreateHumanCallRequest,
    call: Call,
    contactName: string,
  ) {
    return this.db
      .transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: actor.id, organizationId: actor.orgId, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Active caller not found');
        const replay = await manager.findOne(HumanCallSession, {
          where: { organizationId: actor.orgId, requestId: request.requestId },
          relations: { call: true },
        });
        if (replay) return { session: replay, created: false };
        if (
          await manager.exists(HumanCallSession, {
            where: { userId: actor.id, finishedAt: IsNull() },
          })
        )
          throw new ConflictException('You already have an active human call');
        await manager.save(Call, call);
        const now = new Date();
        const session = manager.create(HumanCallSession, {
          callId: call.id,
          organizationId: actor.orgId,
          userId: actor.id,
          callerName: (actor.name || actor.email).slice(0, 255),
          crmIntegrationId: request.crmIntegrationId,
          crmContactId: request.crmContactId,
          contactName,
        contactPhone: call.toNumber!,
          requestId: request.requestId,
          selection: {
            crmIntegrationId: request.crmIntegrationId,
            crmContactId: request.crmContactId,
            sipTrunkId: request.sipTrunkId,
          },
          browserIdentity: `human-${call.id}`,
          sipIdentity: `contact-${call.id}`,
          phase: 'preparing',
          joinDeadline: new Date(now.getTime() + 120_000),
          leaseToken: randomUUID(),
          leaseUntil: new Date(now.getTime() + 30_000),
          nextCheckAt: now,
        });
        await manager.save(session);
        session.call = call;
        return { session, created: true };
      })
      .catch((error: unknown) => {
        if (
          error instanceof QueryFailedError &&
          error.driverError.code === '23505'
        )
          throw new ConflictException(
            'Request ID is already used or you already have an active human call',
          );
        throw error;
      });
  }

  async claimDue(): Promise<HumanCallSession[]> {
    const token = randomUUID();
    const rows: Array<{ id: string }> = await this.db.query(
      `WITH claimed AS (UPDATE human_call_sessions SET lease_token = $1,
      lease_until = NOW() + INTERVAL '30 seconds'
      WHERE id IN (SELECT id FROM human_call_sessions WHERE finished_at IS NULL
        AND next_check_at <= NOW() AND (lease_until IS NULL OR lease_until < NOW())
        ORDER BY next_check_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING id)
      SELECT id FROM claimed`,
      [token],
    );
    return Promise.all(rows.map(async (row) => (await this.find(row.id))!));
  }

  /** Lock call before session consistently with admission. Never save a stale view. */
  async mutate(
    id: string,
    token: string | null,
    action: (session: HumanCallSession, call: Call) => void,
  ) {
    return this.db.transaction(async (manager) => {
      const reference = await manager.findOneBy(HumanCallSession, { id });
      if (!reference) return null;
      const call = await manager.findOne(Call, {
        where: { id: reference.callId },
        lock: { mode: 'pessimistic_write' },
      });
      const session = await manager.findOne(HumanCallSession, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || !call || session.finishedAt) return null;
      if (
        token &&
        (session.leaseToken !== token ||
          !session.leaseUntil ||
          session.leaseUntil <= new Date())
      )
        return null;
      action(session, call);
      await manager.save(call);
      await manager.save(session);
      session.call = call;
      return session;
    });
  }

  async release(id: string, token: string) {
    await this.db.getRepository(HumanCallSession).update(
      { id, leaseToken: token },
      {
        leaseToken: null,
        leaseUntil: null,
        nextCheckAt: new Date(Date.now() + 2000),
      },
    );
  }
}

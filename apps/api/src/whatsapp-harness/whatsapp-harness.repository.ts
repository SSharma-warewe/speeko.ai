import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
} from 'typeorm';
import type {
  WhatsAppTurnCheckpoint,
  WhatsAppTaskConfiguration,
} from '@call-agent/contracts';
import { WhatsAppTaskSession } from './whatsapp-task-session.entity';
import { isExplicitBookingDecline } from './task-decline';
import { WhatsAppConversation } from './whatsapp-conversation.entity';
import { WhatsAppTurn } from './whatsapp-turn.entity';
import { WhatsAppOutbox } from './whatsapp-outbox.entity';
import { WhatsAppToolOperation } from './whatsapp-tool-operation.entity';
import {
  isNewSessionCommand,
  NEW_SESSION_REPLY,
} from '../whatsapp-agent/lib/session-command';

export const EMPTY_SESSION = () => ({ state: {}, events: [] });
export const TURN_MAX_ATTEMPTS = 3;
export const TURN_LEASE_MS = 45_000;
export const TURN_MAX_RUNTIME_MS = 180_000;
export type LockedTurn = {
  turn: WhatsAppTurn;
  conversation: WhatsAppConversation;
  task: WhatsAppTaskSession | null;
  manager: EntityManager;
};

@Injectable()
export class WhatsAppHarnessRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async ingest(input: {
    organizationId: string | null;
    connectionId: string | null;
    scope?: 'org' | 'platform';
    sender: string;
    phoneNumberId: string;
    messageId: string;
    body: string;
  }): Promise<void> {
    await this.db.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsAppConversation)
        .values({
          organizationId: input.organizationId,
          connectionId: input.connectionId,
          sender: input.sender,
          scope: input.scope ?? 'org',
          platformPhoneNumberId:
            input.scope === 'platform' ? input.phoneNumberId : null,
        })
        .orIgnore()
        .execute();
      const conversation = await manager.findOneOrFail(WhatsAppConversation, {
        where:
          input.scope === 'platform'
            ? {
                scope: 'platform',
                platformPhoneNumberId: input.phoneNumberId,
                sender: input.sender,
              }
            : {
                scope: 'org',
                connectionId: input.connectionId!,
                sender: input.sender,
              },
        lock: { mode: 'pessimistic_write' },
      });
      const duplicate = await manager.findOneBy(WhatsAppTurn, {
        phoneNumberId: input.phoneNumberId,
        messageId: input.messageId,
      });
      if (duplicate) return;
      const reset = isNewSessionCommand(input.body);
      if (reset) {
        await manager.update(
          WhatsAppTaskSession,
          { conversationId: conversation.id, status: 'active' },
          { status: 'cancelled', outcome: 'reset', closedAt: new Date() },
        );
        conversation.generation++;
        conversation.session = EMPTY_SESSION();
        conversation.toolState = {};
        await manager.update(
          WhatsAppTurn,
          {
            conversationId: conversation.id,
            status: In(['pending', 'running', 'failed']),
          },
          { status: 'cancelled', leaseToken: null, leaseExpiresAt: null },
        );
        await manager.query(
          `UPDATE whatsapp_message_outbox o SET status='cancelled' FROM whatsapp_agent_turns t WHERE o.turn_id=t.id AND t.conversation_id=$1 AND o.status IN ('pending','sending','uncertain','failed')`,
          [conversation.id],
        );
      }
      const turn = manager.create(WhatsAppTurn, {
        taskProtocolVersion: input.scope === 'platform' ? null : 1,
        conversationId: conversation.id,
        phoneNumberId: input.phoneNumberId,
        messageId: input.messageId,
        generation: conversation.generation,
        sequence: conversation.nextSequence++,
        body: input.body.slice(0, 4096),
        status: reset ? 'succeeded' : 'pending',
        nextAttemptAt: new Date(),
      });
      await manager.save(conversation);
      await manager.save(turn);
      if (reset)
        await manager.save(
          manager.create(WhatsAppOutbox, {
            turnId: turn.id,
            body: NEW_SESSION_REPLY,
          }),
        );
    });
  }

  async claim(limit: number): Promise<WhatsAppTurn[]> {
    return this.db.transaction(async (manager) => {
      // Serialize the capacity check across API replicas, then row-lock only
      // conversations selected for dispatch (the outbound ticker pattern).
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('whatsapp_harness_claim'))`,
      );
      const running = await manager.count(WhatsAppTurn, {
        where: { status: 'running' },
      });
      const available = Math.max(0, limit - running);
      if (!available) return [];
      const candidates: Array<{ id: string }> = await manager.query(
        `
        SELECT c.id FROM whatsapp_conversations c
        WHERE (c.scope='platform' OR EXISTS (SELECT 1 FROM organization_integrations i WHERE i.id=c.connection_id AND i.is_active=true AND i.whatsapp_task_key IS NOT NULL AND NULLIF(TRIM(i.system_prompt),'') IS NOT NULL))
        AND EXISTS (SELECT 1 FROM whatsapp_agent_turns t WHERE t.conversation_id=c.id AND t.generation=c.generation AND t.status='pending' AND t.next_attempt_at<=NOW()
          AND NOT EXISTS (SELECT 1 FROM whatsapp_agent_turns earlier WHERE earlier.conversation_id=c.id AND earlier.generation=c.generation AND earlier.sequence<t.sequence AND earlier.status IN ('pending','failed')))
        AND NOT EXISTS (SELECT 1 FROM whatsapp_agent_turns t WHERE t.conversation_id=c.id AND t.status='running')
        AND NOT EXISTS (SELECT 1 FROM whatsapp_message_outbox o JOIN whatsapp_agent_turns t ON t.id=o.turn_id WHERE t.conversation_id=c.id AND t.generation=c.generation AND o.status NOT IN ('accepted','cancelled'))
        ORDER BY c.updated_at ASC FOR UPDATE OF c SKIP LOCKED LIMIT $1`,
        [available],
      );
      const result: WhatsAppTurn[] = [];
      for (const candidate of candidates) {
        const conversation = await manager.findOneByOrFail(
          WhatsAppConversation,
          { id: candidate.id },
        );
        // Only the oldest unfinished turn may run, even when its retry is delayed.
        const turn = await manager.findOne(WhatsAppTurn, {
          where: {
            conversationId: candidate.id,
            generation: conversation.generation,
            status: In(['pending', 'failed']),
          },
          order: { sequence: 'ASC' },
        });
        if (
          !turn ||
          turn.status !== 'pending' ||
          turn.nextAttemptAt > new Date()
        )
          continue;
        turn.status = 'running';
        turn.attemptCount++;
        turn.leaseToken = randomUUID();
        turn.leaseExpiresAt = new Date(Date.now() + TURN_LEASE_MS);
        turn.startedAt = new Date();
        if (conversation.scope === 'platform')
          turn.baseSession ??= structuredClone(conversation.session);
        else {
          if (!turn.taskSessionId) {
            const active = await manager.findOneBy(WhatsAppTaskSession, {
              conversationId: conversation.id,
              status: 'active',
              generation: conversation.generation,
            });
            if (active) turn.taskSessionId = active.id;
          }
          if (turn.taskSessionId) {
            const task = await manager.findOneByOrFail(WhatsAppTaskSession, {
              id: turn.taskSessionId,
            });
            if (task.status !== 'active' && task.terminalTurnId !== turn.id)
              continue;
            turn.baseSession ??= structuredClone(task.session);
          }
        }
        await manager.save(turn);
        result.push(turn);
      }
      return result;
    });
  }

  async withTurn<T>(
    id: string,
    leaseToken: string,
    action: (locked: LockedTurn) => Promise<T>,
    allowCompleted = false,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      const initial = await manager.findOneBy(WhatsAppTurn, { id });
      if (!initial) throw new NotFoundException('WhatsApp turn not found');
      const conversation = await manager.findOneOrFail(WhatsAppConversation, {
        where: { id: initial.conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      const turn = await manager.findOneByOrFail(WhatsAppTurn, { id });
      if (
        turn.generation !== conversation.generation ||
        turn.leaseToken !== leaseToken ||
        (turn.status !== 'running' &&
          !(allowCompleted && turn.status === 'succeeded')) ||
        (turn.status === 'running' &&
          (!turn.leaseExpiresAt || turn.leaseExpiresAt <= new Date()))
      )
        throw new ConflictException('WhatsApp turn lease expired');
      const task = turn.taskSessionId
        ? await manager.findOneByOrFail(WhatsAppTaskSession, {
            id: turn.taskSessionId,
          })
        : null;
      if (
        task &&
        (task.generation !== conversation.generation ||
          task.conversationId !== conversation.id ||
          (task.status !== 'active' && task.terminalTurnId !== turn.id))
      )
        throw new ConflictException('WhatsApp task session is closed');
      return action({ turn, conversation, task, manager });
    });
  }

  async bindTask(
    id: string,
    token: string,
    configuration: () => Promise<WhatsAppTaskConfiguration>,
  ) {
    return this.withTurn(
      id,
      token,
      async ({ turn, conversation, task, manager }) => {
        if (task) return task;
        if (conversation.scope === 'platform')
          throw new ConflictException('Platform has no task session');
        let active = await manager.findOneBy(WhatsAppTaskSession, {
          conversationId: conversation.id,
          status: 'active',
        });
        if (!active)
          active = await manager.save(
            manager.create(WhatsAppTaskSession, {
              conversationId: conversation.id,
              generation: conversation.generation,
              configuration: await configuration(),
              session: EMPTY_SESSION(),
              toolState: {},
            }),
          );
        turn.taskSessionId = active.id;
        turn.baseSession = structuredClone(active.session);
        turn.checkpoint = null;
        await manager.save(turn);
        return active;
      },
    );
  }

  async heartbeat(id: string, token: string) {
    return this.withTurn(id, token, async ({ turn, manager }) => {
      if (
        !turn.startedAt ||
        Date.now() - turn.startedAt.getTime() > TURN_MAX_RUNTIME_MS
      )
        throw new ConflictException('WhatsApp turn deadline exceeded');
      turn.leaseExpiresAt = new Date(Date.now() + TURN_LEASE_MS);
      await manager.save(turn);
      return { success: true };
    });
  }

  async checkpoint(
    id: string,
    token: string,
    checkpoint: WhatsAppTurnCheckpoint,
  ) {
    return this.withTurn(id, token, async ({ turn, task, manager }) => {
      // A repeated non-final callback must not erase a final answer.
      if (checkpoint.decline)
        await this.validateDecline(
          turn,
          task,
          manager,
          checkpoint.decline.evidence,
        );
      if (!turn.checkpoint?.reply) turn.checkpoint = checkpoint;
      await manager.save(turn);
      return { success: true };
    });
  }

  private async validateDecline(
    turn: WhatsAppTurn,
    task: WhatsAppTaskSession | null,
    manager: EntityManager,
    evidence: string,
  ) {
    if (
      !task ||
      task.status !== 'active' ||
      !isExplicitBookingDecline(
        turn.body,
        evidence,
        turn.baseSession ?? EMPTY_SESSION(),
      )
    )
      throw new ConflictException(
        'Explicit customer booking refusal is required',
      );
    const unknown = await manager.count(WhatsAppToolOperation, {
      where: {
        taskSessionId: task.id,
        toolId: 'scheduleGhlMeeting',
        status: 'running',
      },
    });
    if (unknown)
      throw new ConflictException(
        'Resolve the unknown booking outcome before closing the task',
      );
  }

  async complete(
    id: string,
    token: string,
    checkpoint: WhatsAppTurnCheckpoint,
  ) {
    return this.withTurn(
      id,
      token,
      async ({ turn, conversation, task, manager }) => {
        if (turn.status === 'succeeded') return { success: true };
        turn.status = 'succeeded';
        turn.checkpoint = checkpoint;
        if (conversation.scope !== 'platform' && !task)
          throw new ConflictException('WhatsApp task is required');
        if (task) {
          if (checkpoint.decline) {
            await this.validateDecline(
              turn,
              task,
              manager,
              checkpoint.decline.evidence,
            );
            task.status = 'cancelled';
            task.outcome = 'declined';
            task.closedAt = new Date();
            task.terminalTurnId = turn.id;
          }
          task.session = checkpoint.session;
          await manager.save(task);
        } else {
          conversation.session = checkpoint.session;
          await manager.save(conversation);
        }
        await manager.save(turn);
        await manager.save(
          manager.create(WhatsAppOutbox, {
            turnId: turn.id,
            body: checkpoint.reply!.trim().slice(0, 4096),
          }),
        );
        return { success: true };
      },
      true,
    );
  }

  async fail(id: string, token: string, code: string, refund = false) {
    return this.withTurn(id, token, async ({ turn, manager }) => {
      if (refund) turn.attemptCount = Math.max(0, turn.attemptCount - 1);
      turn.status =
        turn.attemptCount >= TURN_MAX_ATTEMPTS ? 'failed' : 'pending';
      turn.errorCode = code;
      turn.nextAttemptAt = new Date(
        Date.now() + Math.min(30_000, 1000 * 2 ** turn.attemptCount),
      );
      turn.leaseExpiresAt = null;
      turn.leaseToken = null;
      await manager.save(turn);
      return { success: true };
    });
  }

  async reap(): Promise<void> {
    // Retire pre-task org generation work; preserve all historical outbox sends.
    await this.db.query(
      `UPDATE whatsapp_agent_turns t SET status='cancelled', error_code='legacy_task_retired', lease_token=NULL, lease_expires_at=NULL FROM whatsapp_conversations c WHERE t.conversation_id=c.id AND c.scope='org' AND t.task_protocol_version IS NULL AND t.status IN ('pending','failed')`,
    );
    const expired = await this.db.getRepository(WhatsAppTurn).find({
      where: {
        status: 'running',
        leaseExpiresAt: LessThanOrEqual(new Date()),
      },
      take: 100,
    });
    for (const candidate of expired)
      await this.db.transaction(async (manager) => {
        await manager.findOne(WhatsAppConversation, {
          where: { id: candidate.conversationId },
          lock: { mode: 'pessimistic_write' },
        });
        const turn = await manager.findOneBy(WhatsAppTurn, {
          id: candidate.id,
        });
        if (
          !turn ||
          turn.status !== 'running' ||
          !turn.leaseExpiresAt ||
          turn.leaseExpiresAt > new Date()
        )
          return;
        turn.status =
          turn.attemptCount >= TURN_MAX_ATTEMPTS ? 'failed' : 'pending';
        turn.errorCode = 'worker_lease_expired';
        turn.leaseToken = null;
        turn.leaseExpiresAt = null;
        turn.nextAttemptAt = new Date(Date.now() + 2000);
        await manager.save(turn);
      });
    // A crashed sender may already have reached Meta. Do not resend blindly.
    await this.db.getRepository(WhatsAppOutbox).update(
      {
        status: 'sending',
        kind: 'text',
        sendStartedAt: LessThanOrEqual(new Date(Date.now() - 60_000)),
      },
      { status: 'uncertain', errorCode: 'send_outcome_unknown' },
    );
  }

  getConversation(id: string) {
    return this.db.getRepository(WhatsAppConversation).findOneByOrFail({ id });
  }

  async reserveSend(): Promise<WhatsAppOutbox | null> {
    return this.db.transaction(async (manager) => {
      const rows: Array<{ id: string }> = await manager.query(
        `SELECT o.id FROM whatsapp_message_outbox o WHERE o.status='pending' AND o.next_attempt_at<=NOW() ORDER BY (o.kind='otp_template') DESC, o.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      if (!rows.length) return null;
      const outbox = await manager.findOneByOrFail(WhatsAppOutbox, {
        id: rows[0].id,
      });
      outbox.status = 'sending';
      outbox.attemptCount++;
      outbox.sendStartedAt = new Date();
      return manager.save(outbox);
    });
  }

  async withSend<T>(
    id: string,
    action: (
      outbox: WhatsAppOutbox,
      conversation: WhatsAppConversation,
      manager: EntityManager,
    ) => Promise<T>,
  ): Promise<T | null> {
    return this.db.transaction(async (manager) => {
      const initial = await manager.findOne(WhatsAppOutbox, {
        where: { id },
        relations: ['turn'],
      });
      if (!initial?.turn || initial.kind !== 'text') return null;
      const conversation = await manager.findOneOrFail(WhatsAppConversation, {
        where: { id: initial.turn.conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      const outbox = await manager.findOneByOrFail(WhatsAppOutbox, { id });
      if (outbox.status !== 'sending') return null;
      if (initial.turn.generation !== conversation.generation) {
        await manager.update(WhatsAppOutbox, id, { status: 'cancelled' });
        return null;
      }
      return action(outbox, conversation, manager);
    });
  }

  private scopeWhere(organizationId: string | null) {
    return organizationId === null
      ? { scope: 'platform' as const, organizationId: IsNull() }
      : { scope: 'org' as const, organizationId };
  }

  async inspect(organizationId: string | null, conversationId?: string) {
    const conversations = await this.db
      .getRepository(WhatsAppConversation)
      .find({
        where: {
          ...this.scopeWhere(organizationId),
          ...(conversationId ? { id: conversationId } : {}),
        },
        order: { updatedAt: 'DESC' },
        take: 50,
      });
    if (conversationId && !conversations.length)
      throw new NotFoundException('WhatsApp conversation not found');
    if (!conversationId)
      return conversations.map(
        ({ id, sender, generation, createdAt, updatedAt }) => ({
          id,
          sender,
          generation,
          createdAt,
          updatedAt,
        }),
      );
    const turns = await this.db.getRepository(WhatsAppTurn).find({
      where: { conversationId },
      order: { sequence: 'DESC' },
      take: 100,
    });
    const taskSessions = await this.db.getRepository(WhatsAppTaskSession).find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const outbox = await this.db
      .getRepository(WhatsAppOutbox)
      .find({ where: { turnId: In(turns.map((turn) => turn.id)) } });
    return {
      conversation: conversations[0],
      taskSessions,
      turns: turns.map(({ leaseToken, ...turn }) => {
        void leaseToken; // Explicitly omit the execution credential from inspection.
        return {
          ...turn,
          outgoing: outbox.find((item) => item.turnId === turn.id) ?? null,
        };
      }),
    };
  }

  async retry(organizationId: string | null, turnId: string) {
    await this.db.transaction(async (manager) => {
      const initial = await manager.findOneBy(WhatsAppTurn, { id: turnId });
      if (!initial) throw new NotFoundException('WhatsApp turn not found');
      const conversation = await manager.findOne(WhatsAppConversation, {
        where: {
          id: initial.conversationId,
          ...this.scopeWhere(organizationId),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!conversation) throw new NotFoundException('WhatsApp turn not found');
      const turn = await manager.findOneByOrFail(WhatsAppTurn, { id: turnId });
      if (turn.generation !== conversation.generation)
        throw new ConflictException('Conversation was reset');
      if (turn.taskSessionId) {
        const task = await manager.findOneByOrFail(WhatsAppTaskSession, {
          id: turn.taskSessionId,
        });
        // Only final confirmation recovery may run after successful closure.
        if (
          task.status !== 'active' &&
          !(task.status === 'completed' && task.terminalTurnId === turn.id)
        )
          throw new ConflictException('WhatsApp task session is closed');
      } else if (conversation.scope !== 'platform' && !turn.taskProtocolVersion)
        throw new ConflictException('Legacy task execution cannot be retried');
      if (turn.status !== 'failed')
        throw new ConflictException(
          'Only failed generation turns can be retried',
        );
      await manager.update(WhatsAppTurn, turnId, {
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        errorCode: null,
      });
    });
    return { success: true };
  }

  async resolveSend(
    organizationId: string | null,
    id: string,
    outcome: 'accepted' | 'failed' | 'retry',
  ) {
    await this.db.transaction(async (manager) => {
      const initial = await manager.findOne(WhatsAppOutbox, {
        where: { id },
        relations: ['turn'],
      });
      if (!initial?.turn || initial.kind !== 'text')
        throw new NotFoundException('WhatsApp message not found');
      const conversation = await manager.findOne(WhatsAppConversation, {
        where: {
          id: initial.turn.conversationId,
          ...this.scopeWhere(organizationId),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!conversation)
        throw new NotFoundException('WhatsApp message not found');
      if (conversation.generation !== initial.turn.generation)
        throw new ConflictException('Conversation was reset');
      const outbox = await manager.findOneByOrFail(WhatsAppOutbox, { id });
      if (outcome === 'retry') {
        if (outbox.status !== 'failed')
          throw new ConflictException(
            'Only definitely failed sends can be retried',
          );
        outbox.status = 'pending';
        outbox.attemptCount = 0;
        outbox.nextAttemptAt = new Date();
      } else {
        if (outbox.status !== 'uncertain')
          throw new ConflictException('Only uncertain sends can be resolved');
        outbox.status = outcome;
      }
      outbox.errorCode = null;
      await manager.save(outbox);
    });
    return { success: true };
  }

  async reserveTool(
    id: string,
    token: string,
    key: string,
    toolId: string,
    validate: (conversation: WhatsAppConversation) => void,
  ) {
    return this.withTurn(
      id,
      token,
      async ({ conversation, turn, task, manager }) => {
        if (!task)
          throw new ConflictException('WhatsApp task session is closed');
        const previous = await manager.findOneBy(WhatsAppToolOperation, {
          conversationId: conversation.id,
          generation: conversation.generation,
          taskSessionId: task.id,
          operationKey: key,
        });
        if (previous) return { operation: previous, fresh: false };
        if (task.status !== 'active')
          throw new ConflictException('WhatsApp task session is closed');
        if (
          toolId === 'scheduleGhlMeeting' &&
          (await manager.count(WhatsAppToolOperation, {
            where: { taskSessionId: task.id, toolId, status: 'running' },
          }))
        )
          throw new ConflictException(
            'Booking operation outcome is unknown; do not submit another booking',
          );
        conversation.toolState = task.toolState;
        validate(conversation);
        const operation = await manager.save(
          manager.create(WhatsAppToolOperation, {
            conversationId: conversation.id,
            generation: conversation.generation,
            taskSessionId: task.id,
            turnId: turn.id,
            operationKey: key,
            toolId,
          }),
        );
        return { operation, fresh: true };
      },
    );
  }

  async finishTool(
    operation: WhatsAppToolOperation,
    result: Record<string, unknown>,
    update: (conversation: WhatsAppConversation) => void,
  ) {
    await this.db.transaction(async (manager) => {
      const conversation = await manager.findOneOrFail(WhatsAppConversation, {
        where: { id: operation.conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      const stored = await manager.findOneByOrFail(WhatsAppToolOperation, {
        id: operation.id,
      });
      if (stored.status === 'finished') return;
      operation.status = 'finished';
      operation.result = result;
      await manager.save(operation);
      const task = operation.taskSessionId
        ? await manager.findOneByOrFail(WhatsAppTaskSession, {
            id: operation.taskSessionId,
          })
        : null;
      if (
        task &&
        conversation.generation === operation.generation &&
        task.status === 'active'
      ) {
        // Existing tool validators operate on this task's API-owned state.
        conversation.toolState = task.toolState;
        update(conversation);
        task.toolState = conversation.toolState;
        if (
          operation.toolId === 'scheduleGhlMeeting' &&
          result.ok === true &&
          typeof result.appointmentId === 'string' &&
          result.appointmentId.trim()
        ) {
          task.status = 'completed';
          task.outcome = 'booked';
          task.result = result;
          task.terminalTurnId = operation.turnId;
          task.closedAt = new Date();
        }
        await manager.save(task);
      }
    });
  }
}

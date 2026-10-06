import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  prepareWhatsAppTaskContext,
  type CreateWhatsAppTaskTestRequest,
  type WhatsAppTaskCompletion,
  type WhatsAppTaskTestRecord,
  type WhatsAppWorkerTurn,
} from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import { WhatsAppTasksService } from './whatsapp-tasks.service';
import {
  WhatsAppTaskTest,
  WhatsAppTaskTestTurn,
} from './whatsapp-task-test.entity';
import {
  checkpointSchema,
  stripThoughts,
} from '../whatsapp-harness/turn-checkpoint';
import { validateTaskCompletion } from './task-completion';

@Injectable()
export class WhatsAppTaskTestsService {
  private ticking = false;
  constructor(
    private readonly db: DataSource,
    private readonly tasks: WhatsAppTasksService,
    private readonly config: ConfigService,
  ) {}
  async create(
    org: string | null,
    taskId: string,
    input: CreateWhatsAppTaskTestRequest,
  ) {
    if (!input.persona.trim())
      throw new BadRequestException('Test persona is required');
    if (JSON.stringify(input.context ?? {}).length > 48000)
      throw new BadRequestException('Test context exceeds 48 KB');
    const snapshot = await this.tasks.draftSnapshot(
      org,
      taskId,
      input.revision,
    );
    const executionOrganizationId = org ?? input.organizationId;
    if (!executionOrganizationId)
      throw new BadRequestException(
        'Select an organization for the sandbox allowlist',
      );
    await this.authorize(executionOrganizationId, snapshot.definition.toolIds);
    let context: Record<string, unknown>;
    try {
      context = prepareWhatsAppTaskContext(snapshot.definition, input.context);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid context',
      );
    }
    const test = await this.db.getRepository(WhatsAppTaskTest).save({
      taskId,
      organizationId: org,
      executionOrganizationId,
      snapshot,
      context,
      persona: input.persona.trim(),
      failureTools: input.simulatedFailureTools ?? [],
    });
    return this.inspect(org, taskId, test.id);
  }
  private async authorize(
    orgId: string,
    tools: readonly string[],
    manager: EntityManager = this.db.manager,
  ) {
    const org = await manager.findOneBy(Organization, { id: orgId });
    if (!org?.isActive)
      throw new NotFoundException('Active organization not found');
    if (
      org.allowedToolIds !== null &&
      tools.some((id) => !org.allowedToolIds?.includes(id))
    )
      throw new BadRequestException(
        'Sandbox requires capabilities assigned to the organization',
      );
  }
  private async owned(org: string | null, taskId: string, id: string) {
    await this.tasks.owned(org, taskId);
    const test = await this.db
      .getRepository(WhatsAppTaskTest)
      .findOneBy({ id, taskId, organizationId: org ?? IsNull() });
    if (!test) throw new NotFoundException('Task test not found');
    return test;
  }
  async inspect(
    org: string | null,
    taskId: string,
    id: string,
  ): Promise<WhatsAppTaskTestRecord> {
    const test = await this.owned(org, taskId, id);
    const turns = await this.db
      .getRepository(WhatsAppTaskTestTurn)
      .find({ where: { testId: id }, order: { createdAt: 'ASC' } });
    return {
      id: test.id,
      snapshot: test.snapshot,
      status: test.status,
      outcome: test.outcome,
      result: test.result,
      turns: turns.map((t) => ({
        id: t.id,
        body: t.body,
        status: t.status,
        reply: t.reply,
        errorCode: t.errorCode,
        toolActivity: t.toolActivity,
      })),
    };
  }
  async reset(org: string | null, taskId: string, id: string) {
    await this.owned(org, taskId, id);
    return this.db.transaction(async (manager) => {
      const test = await manager.findOneOrFail(WhatsAppTaskTest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (test.status === 'active') {
        test.status = 'cancelled';
        test.outcome = 'reset';
        await manager.save(test);
      }
      await manager.query(
        `UPDATE whatsapp_task_test_turns SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE test_id=$1 AND status IN ('pending','running','failed')`,
        [id],
      );
      return { success: true };
    });
  }
  async message(
    org: string | null,
    taskId: string,
    id: string,
    body: string,
    clientMessageId: string,
  ) {
    if (!body.trim())
      throw new BadRequestException('Customer message is required');
    await this.owned(org, taskId, id);
    return this.db.transaction(async (manager) => {
      const test = await manager.findOneOrFail(WhatsAppTaskTest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const previous = await manager.findOneBy(WhatsAppTaskTestTurn, {
        testId: id,
        clientMessageId,
      });
      if (previous) return { turnId: previous.id };
      if (test.status !== 'active')
        throw new ConflictException('Start a fresh test after completion');
      const unfinished = await manager.findOneBy(WhatsAppTaskTestTurn, {
        testId: id,
        status: 'pending',
      });
      const running = await manager.findOneBy(WhatsAppTaskTestTurn, {
        testId: id,
        status: 'running',
      });
      if (unfinished || running)
        throw new ConflictException('Wait for the current sandbox reply');
      const turn = await manager.save(WhatsAppTaskTestTurn, {
        testId: id,
        clientMessageId,
        body: body.trim(),
      });
      return { turnId: turn.id };
    });
  }
  private async locked<T>(
    id: string,
    lease: string,
    action: (
      test: WhatsAppTaskTest,
      turn: WhatsAppTaskTestTurn,
      manager: EntityManager,
    ) => Promise<T>,
    completed = false,
  ) {
    return this.db.transaction(async (manager) => {
      const source = await manager.findOne(WhatsAppTaskTestTurn, {
        where: { id },
        select: { id: true, testId: true },
      });
      if (!source) throw new NotFoundException('Sandbox turn not found');
      const test = await manager.findOneOrFail(WhatsAppTaskTest, {
        where: { id: source.testId },
        lock: { mode: 'pessimistic_write' },
      });
      const turn = await manager
        .createQueryBuilder(WhatsAppTaskTestTurn, 't')
        .addSelect('t.leaseToken')
        .where('t.id = :id', { id })
        .getOneOrFail();
      if (
        turn.leaseToken !== lease ||
        (!(completed && turn.status === 'succeeded') &&
          (turn.status !== 'running' ||
            !turn.leaseExpiresAt ||
            turn.leaseExpiresAt.getTime() < Date.now()))
      )
        throw new ConflictException('Sandbox lease is stale');
      return action(test, turn, manager);
    });
  }
  private completion(
    test: WhatsAppTaskTest,
    turn: WhatsAppTaskTestTurn,
    completion: WhatsAppTaskCompletion,
  ) {
    if (test.status !== 'active')
      throw new ConflictException('Sandbox task is closed');
    const errors = validateTaskCompletion(
      test.snapshot.definition,
      completion,
      turn.body,
      turn.baseSession ?? test.session,
      (test.toolState.receipt as Record<string, unknown>) ?? null,
    );
    if (errors.length) throw new ConflictException(errors.join('; '));
    return test.snapshot.definition.outcomes.find(
      (o) => o.key === completion.outcome,
    )!;
  }
  async callback(
    id: string,
    lease: string,
    action: string,
    input: Record<string, unknown>,
  ) {
    return this.locked(
      id,
      lease,
      async (test, turn, manager) => {
        if (action === 'complete' && turn.status === 'succeeded')
          return { success: true };
        if (action === 'heartbeat') {
          if (!turn.startedAt || Date.now() - turn.startedAt.getTime() > 180000)
            throw new ConflictException('Sandbox deadline exceeded');
          turn.leaseExpiresAt = new Date(Date.now() + 45000);
          await manager.save(turn);
          return { success: true };
        }
        if (action === 'fail') {
          turn.status = 'failed';
          turn.errorCode = 'model_error';
          await manager.save(turn);
          return { success: true };
        }
        await this.authorize(
          test.executionOrganizationId,
          test.snapshot.definition.toolIds,
          manager,
        );
        if (action === 'validate-completion') {
          const parsed = checkpointSchema.shape.completion.parse(
            input.completion,
          );
          if (!parsed) throw new BadRequestException('Completion is required');
          const errors = (() => {
            try {
              this.completion(test, turn, parsed);
              return [];
            } catch (error) {
              if (error instanceof ConflictException) return [error.message];
              throw error;
            }
          })();
          if (errors.length)
            turn.toolActivity.push({
              toolId: 'complete_whatsapp_task',
              args: parsed,
              result: { ok: false, error: errors.join('; ') },
            });
          await manager.save(turn);
          return errors.length
            ? { ok: false, error: errors.join('; ') }
            : { ok: true };
        }
        if (action === 'tools') {
          const toolId = String(input.toolId);
          const args = input.args as Record<string, string>;
          if (
            !test.snapshot.definition.toolIds.includes(toolId as never) ||
            !args ||
            Object.values(args).some(
              (v) => typeof v !== 'string' || v.length > 8000,
            )
          )
            throw new BadRequestException('Invalid sandbox tool');
          let result: Record<string, unknown> = {
            ok: false,
            error: 'simulated_tool_failure',
          };
          if (!test.failureTools.includes(toolId as never)) {
            if (
              toolId === 'lookupGhlContact' ||
              toolId === 'upsertGhlContact'
            ) {
              test.toolState.contactId = 'sandbox-contact';
              result = { ok: true, contactId: 'sandbox-contact', found: true };
            } else if (toolId === 'checkGhlFreeSlots') {
              const start = Date.parse(args.startTime);
              const end = Date.parse(args.endTime);
              if (
                !Number.isFinite(start) ||
                !Number.isFinite(end) ||
                end <= start
              )
                result = { ok: false, error: 'invalid_time_window' };
              else {
                const slots = [
                  new Date(start).toISOString(),
                  new Date(start + 1800000).toISOString(),
                ].filter((s) => Date.parse(s) < end);
                test.toolState.slots = slots;
                result = {
                  ok: true,
                  slots: slots.map((startIso) => ({
                    startIso,
                    endIso: new Date(
                      Date.parse(startIso) + 1800000,
                    ).toISOString(),
                  })),
                };
              }
            } else if (toolId === 'scheduleGhlMeeting') {
              if (test.toolState.receipt)
                result = test.toolState.receipt as Record<string, unknown>;
              else if (
                !test.toolState.contactId ||
                !(test.toolState.slots as string[] | undefined)?.some(
                  (s) => Date.parse(s) === Date.parse(args.startTime),
                )
              )
                result = {
                  ok: false,
                  error: 'Check slots and find a contact first',
                };
              else {
                result = {
                  ok: true,
                  appointmentId: `sandbox-${test.id}`,
                  startTime: args.startTime,
                  timezone: args.timezone ?? 'UTC',
                };
                test.toolState.receipt = result;
              }
            }
          }
          turn.toolActivity.push({ toolId, args, result });
          await manager.save(test);
          await manager.save(turn);
          return result;
        }
        if (!['checkpoint', 'complete'].includes(action))
          throw new BadRequestException('Unsupported sandbox callback');
        const checkpoint = stripThoughts(checkpointSchema.parse(input));
        if (checkpoint.decline)
          throw new BadRequestException(
            'Configured tests use completion outcomes',
          );
        if (checkpoint.completion)
          this.completion(test, turn, checkpoint.completion);
        if (action === 'checkpoint') {
          if (!turn.checkpoint?.reply) turn.checkpoint = checkpoint;
        } else {
          if (!checkpoint.reply)
            throw new BadRequestException('Final reply is required');
          turn.checkpoint = checkpoint;
          turn.reply = checkpoint.reply;
          turn.status = 'succeeded';
          test.session = checkpoint.session;
          if (checkpoint.completion) {
            const outcome = this.completion(test, turn, checkpoint.completion);
            test.status = outcome.terminalStatus;
            test.outcome = outcome.key;
            test.result = checkpoint.completion.fields;
          }
          await manager.save(test);
        }
        await manager.save(turn);
        return { success: true };
      },
      action === 'complete',
    );
  }
  @Interval(1000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const url = this.config
        .get<string>('WHATSAPP_WORKER_URL')
        ?.replace(/\/$/, '');
      const secret = this.config.get<string>('WORKER_CALLBACK_SECRET');
      if (!url || !secret) return;
      const health = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
      if (
        !health.ok ||
        !(
          (await health.json()) as { supportedTaskProtocolVersions?: number[] }
        ).supportedTaskProtocolVersions?.includes(2)
      )
        return;
      const jobs = await this.db.transaction(async (manager) => {
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtext('whatsapp_harness_claim'))`,
        );
        await manager.query(
          `UPDATE whatsapp_task_test_turns SET status='failed',error_code='lease_expired' WHERE status='running' AND lease_expires_at<NOW()`,
        );
        const [{ running }] = await manager.query(
          `SELECT (SELECT COUNT(*) FROM whatsapp_agent_turns WHERE status='running')+(SELECT COUNT(*) FROM whatsapp_task_test_turns WHERE status='running') AS running`,
        );
        const limit = Math.max(
          0,
          (Number(this.config.get('WHATSAPP_TICKER_MAX_CONCURRENT')) || 4) -
            Number(running),
        );
        // Pending production jobs get first use of the shared capacity.
        const [{ waiting }] = await manager.query(`
          SELECT COUNT(*) AS waiting FROM whatsapp_conversations c
          WHERE (c.scope='platform' OR EXISTS (SELECT 1 FROM organization_integrations i WHERE i.id=c.connection_id AND i.is_active=true AND (i.whatsapp_task_key IS NOT NULL OR i.whatsapp_task_id IS NOT NULL) AND NULLIF(TRIM(i.system_prompt),'') IS NOT NULL))
          AND EXISTS (SELECT 1 FROM whatsapp_agent_turns t WHERE t.conversation_id=c.id AND t.generation=c.generation AND t.status='pending' AND t.next_attempt_at<=NOW()
            AND NOT EXISTS (SELECT 1 FROM whatsapp_agent_turns earlier WHERE earlier.conversation_id=c.id AND earlier.generation=c.generation AND earlier.sequence<t.sequence AND earlier.status IN ('pending','failed')))
          AND NOT EXISTS (SELECT 1 FROM whatsapp_agent_turns t WHERE t.conversation_id=c.id AND t.status='running')
          AND NOT EXISTS (SELECT 1 FROM whatsapp_message_outbox o JOIN whatsapp_agent_turns t ON t.id=o.turn_id WHERE t.conversation_id=c.id AND t.generation=c.generation AND o.status NOT IN ('accepted','cancelled'))
        `);
        if (!limit || Number(waiting)) return [];
        const turns = await manager
          .createQueryBuilder(WhatsAppTaskTestTurn, 't')
          .where("t.status='pending'")
          .orderBy('t.createdAt', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .limit(limit)
          .getMany();
        const result: WhatsAppWorkerTurn[] = [];
        for (const turn of turns) {
          const test = await manager.findOneOrFail(WhatsAppTaskTest, {
            where: { id: turn.testId },
            lock: { mode: 'pessimistic_write' },
          });
          if (test.status !== 'active') {
            turn.status = 'cancelled';
            await manager.save(turn);
            continue;
          }
          turn.status = 'running';
          turn.leaseToken = randomUUID();
          turn.leaseExpiresAt = new Date(Date.now() + 45000);
          turn.startedAt = new Date();
          turn.baseSession ??= structuredClone(test.session);
          await manager.save(turn);
          result.push({
            id: turn.id,
            conversationId: test.id,
            generation: 1,
            leaseToken: turn.leaseToken,
            sender: '10000000000',
            body: turn.body,
            prompt: test.persona,
            enabledTools: test.snapshot.definition.toolIds,
            session: turn.baseSession,
            checkpoint: turn.checkpoint,
            taskProtocolVersion: 2,
            sandbox: true,
            task: {
              sessionId: test.id,
              key: 'configured',
              version: 0,
              objective: test.snapshot.definition.objective,
              completionRule: 'configured',
              snapshot: test.snapshot,
              context: test.context,
              status: test.status,
              result: test.result,
            },
          });
        }
        return result;
      });
      await Promise.all(
        jobs.map(async (job) => {
          try {
            const response = await fetch(`${url}/test-turns`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Worker-Secret': secret,
              },
              body: JSON.stringify(job),
              signal: AbortSignal.timeout(8000),
              redirect: 'error',
            });
            if (!response.ok)
              await this.callback(job.id, job.leaseToken, 'fail', {});
          } catch {
            /* Ambiguous acceptance remains leased until expiry. */
          }
        }),
      );
    } catch {
      /* Next tick recovers leases; no sensitive logging. */
    } finally {
      this.ticking = false;
    }
  }
}

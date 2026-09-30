import { randomUUID } from 'node:crypto';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';
import { AuthModule } from '../../auth/auth.module';
import { GhlModule } from '../../ghl/ghl.module';
import { EmailModule } from '../../email/email.module';
import { WhatsAppTickerService } from '../whatsapp-ticker.service';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationIntegration } from '../../organization-integrations/organization-integration.entity';
import { WhatsAppHarnessRepository } from '../whatsapp-harness.repository';
import { WhatsAppConversation } from '../whatsapp-conversation.entity';
import { WhatsAppTurn } from '../whatsapp-turn.entity';
import { WhatsAppOutbox } from '../whatsapp-outbox.entity';
import { WhatsAppToolOperation } from '../whatsapp-tool-operation.entity';
import { OtpChallenge } from '../../otp/otp-challenge.entity';
import { OtpDeliveryRepository } from '../otp-delivery.repository';
import { OtpDeliveryService } from '../otp-delivery.service';
import { OtpChallengesRepository } from '../../otp/otp-challenges.repository';
import { OtpService } from '../../otp/otp.service';
import { PlatformWhatsAppConfig } from '../../meta-whatsapp/platform-whatsapp.config';
import { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';
import { ConfigService } from '@nestjs/config';
import { encryptOtp, otpDeliveryKey } from '../otp-delivery.crypto';
import { hmacSha256 } from '../../otp/otp-hash';
import { OtpModule } from '../../otp/otp.module';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../users/user.entity';
import { Admin } from '../../admins/admin.entity';

const databaseUrl = process.env.WHATSAPP_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('WhatsApp harness with real PostgreSQL transactions', () => {
  let db: DataSource;
  let repository: WhatsAppHarnessRepository;
  let input: {
    organizationId: string;
    connectionId: string;
    sender: string;
    phoneNumberId: string;
    messageId: string;
    body: string;
  };
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    // This suite writes only to a dedicated local test cluster/schema.
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '55439' ||
      url.pathname !== '/whatsapp_harness_test'
    )
      throw new Error(
        'Use the isolated local whatsapp_harness_test database on port 55439',
      );
    db = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema: 'harness_test',
      entities: getMetadataArgsStorage().tables.map(
        (table) => table.target as Function,
      ),
      synchronize: false,
    });
    await db.initialize();
    await db.query('CREATE SCHEMA IF NOT EXISTS harness_test');
    await db.query('SET search_path TO harness_test, public');
    // SQL snippets use unqualified names, as the production public schema does.
    await db.destroy();
    db = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema: 'harness_test',
      extra: { options: '-c search_path=harness_test,public' },
      entities: getMetadataArgsStorage().tables.map(
        (table) => table.target as Function,
      ),
      synchronize: true,
    });
    await db.initialize();
    repository = new WhatsAppHarnessRepository(db);
  }, 30_000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM harness_test.whatsapp_conversations');
    await db.query('DELETE FROM harness_test.otp_challenges');
    const organization = await db.getRepository(Organization).save({
      name: 'Harness test',
      slug: randomUUID(),
      isActive: true,
      allowedToolIds: null,
    });
    const connection = await db.getRepository(OrganizationIntegration).save({
      organizationId: organization.id,
      name: 'Test line',
      provider: 'whatsapp',
      apiKey: 'test-token',
      apiKeyPrefix: 'test',
      phoneNumberId: String(Date.now()) + Math.floor(Math.random() * 1000),
      wabaId: '12345678',
      systemPrompt: 'Test receptionist',
      isActive: true,
    });
    input = {
      organizationId: organization.id,
      connectionId: connection.id,
      sender: '919876543210',
      phoneNumberId: connection.phoneNumberId!,
      messageId: randomUUID(),
      body: 'Hello',
    };
  });

  it('dedupes platform messages, fences resets, and isolates platform recovery from org users', async () => {
    const platform = {
      ...input,
      scope: 'platform' as const,
      organizationId: null,
      connectionId: null,
    };
    await Promise.all([
      repository.ingest(platform),
      repository.ingest(platform),
    ]);
    const [turn] = await repository.claim(4);
    expect(await db.getRepository(WhatsAppTurn).count()).toBe(1);
    await repository.complete(turn.id, turn.leaseToken!, {
      session: { state: {}, events: [] },
      reply: 'Hello',
    });
    const delivery = await repository.reserveSend();
    await expect(
      repository.inspect(input.organizationId, turn.conversationId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      repository.resolveSend(input.organizationId, delivery!.id, 'retry'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await repository.inspect(null, turn.conversationId)).conversation.scope,
    ).toBe('platform');
    await repository.ingest({
      ...platform,
      messageId: 'platform.reset',
      body: '/NEW',
    });
    const conversation = await repository.getConversation(turn.conversationId);
    expect(conversation.generation).toBe(2);
    expect(
      await repository.withSend(delivery!.id, async () => {
        throw new Error('must not send');
      }),
    ).toBeNull();
    await expect(
      repository.complete(turn.id, turn.leaseToken!, {
        session: { state: {}, events: [] },
        reply: 'Late',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  function otpPair() {
    const challenge = Object.assign(new OtpChallenge(), {
      id: randomUUID(),
      phoneDigits: input.sender,
      codeHash: hmacSha256('test-pepper', '123456'),
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
      attemptCount: 0,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationUsedAt: null,
    });
    const delivery = Object.assign(new WhatsAppOutbox(), {
      id: randomUUID(),
      kind: 'otp_template',
      challengeId: challenge.id,
      turnId: null,
      body: null,
      phoneNumberId: input.phoneNumberId,
      graphVersion: 'v22.0',
      templateName: 'speeko_ai',
      encryptedCode: encryptOtp(
        '123456',
        otpDeliveryKey('ab'.repeat(32)),
        challenge.id,
        challenge.expiresAt,
      ),
    });
    return { challenge, delivery };
  }

  it('atomically issues concurrent OTPs, only leaves the newest valid, and prioritizes OTP over text', async () => {
    const otp = new OtpDeliveryRepository(db);
    await repository.ingest({ ...input, body: '/new' });
    const first = otpPair();
    const second = otpPair();
    await Promise.all([
      otp.issue(first.challenge, first.delivery),
      otp.issue(second.challenge, second.delivery),
    ]);
    const open = await db.query(
      `SELECT id FROM otp_challenges WHERE consumed_at IS NULL`,
    );
    expect(open).toHaveLength(1);
    const selected = await repository.reserveSend();
    expect(selected!.kind).toBe('otp_template');
    expect(selected!.challengeId).toBe(open[0].id);
    const cancelled = await db.query(
      `SELECT encrypted_code FROM whatsapp_message_outbox WHERE kind='otp_template' AND status='cancelled'`,
    );
    expect(cancelled).toEqual([{ encrypted_code: null }]);
    expect(JSON.stringify(await otp.diagnostics())).not.toContain(
      'encryptedCode',
    );
    await expect(
      repository.resolveSend(null, selected!.id, 'retry'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      repository.resolveSend(input.organizationId, selected!.id, 'retry'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('holds the phone fence while sending: resend waits and cannot invalidate an in-flight send', async () => {
    const otp = new OtpDeliveryRepository(db);
    const first = otpPair();
    const second = otpPair();
    await otp.issue(first.challenge, first.delivery);
    const reserved = await repository.reserveSend();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const sending = otp.withDelivery(
      reserved!.id,
      async (outbox, _challenge, manager) => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        outbox.status = 'accepted';
        outbox.encryptedCode = null;
        await manager.save(outbox);
      },
    );
    await started;
    let issued = false;
    const issuing = otp.issue(second.challenge, second.delivery).then(() => {
      issued = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(issued).toBe(false);
    release();
    await Promise.all([sending, issuing]);
    expect((await otp.status(first.challenge.id))!.status).toBe('accepted');
    expect(
      (
        await db
          .getRepository(OtpChallenge)
          .findOneByOrFail({ id: first.challenge.id })
      ).consumedAt,
    ).not.toBeNull();
  });

  it('recovers encrypted delivery after service restart and never retries crashed or expired sends', async () => {
    const otp = new OtpDeliveryRepository(db);
    const pair = otpPair();
    await otp.issue(pair.challenge, pair.delivery);
    const reserved = await repository.reserveSend();
    const config = new ConfigService({
      OTP_HASH_SECRET: 'test-pepper',
      OTP_DELIVERY_ENCRYPTION_KEY: 'ab'.repeat(32),
      WHATSAPP_API_KEY: 'test-token',
      WHATSAPP_URL: `https://graph.facebook.com/v22.0/${input.phoneNumberId}/messages`,
    });
    const meta = {
      sendTemplate: jest
        .fn()
        .mockResolvedValue({ ok: true, data: { wamid: 'accepted' } }),
    };
    await new OtpDeliveryService(
      config,
      new OtpDeliveryRepository(db),
      new PlatformWhatsAppConfig(config),
      meta as unknown as MetaWhatsAppClient,
    ).sendReserved(reserved!.id);
    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(
      await db.query(
        `SELECT encrypted_code FROM whatsapp_message_outbox WHERE id=$1`,
        [reserved!.id],
      ),
    ).toEqual([{ encrypted_code: null }]);
    const crash = otpPair();
    await otp.issue(crash.challenge, crash.delivery);
    await repository.reserveSend();
    await db.getRepository(WhatsAppOutbox).update(crash.delivery.id, {
      sendStartedAt: new Date(Date.now() - 61_000),
    });
    await otp.reap();
    expect((await otp.status(crash.challenge.id))!.status).toBe('uncertain');
    expect(
      (
        await db
          .getRepository(OtpChallenge)
          .findOneByOrFail({ id: crash.challenge.id })
      ).consumedAt,
    ).not.toBeNull();
    expect(await repository.reserveSend()).toBeNull();
    const expired = otpPair();
    await otp.issue(expired.challenge, expired.delivery);
    await db
      .getRepository(OtpChallenge)
      .update(expired.challenge.id, { expiresAt: new Date(0) });
    await otp.reap();
    expect((await otp.status(expired.challenge.id))!.status).toBe('cancelled');
  });

  it('serializes concurrent verification and proof consumption so each succeeds once', async () => {
    const otp = new OtpDeliveryRepository(db);
    const pair = otpPair();
    await otp.issue(pair.challenge, pair.delivery);
    const config = new ConfigService({ OTP_HASH_SECRET: 'test-pepper' });
    const service = new OtpService(
      config,
      new OtpChallengesRepository(db.getRepository(OtpChallenge)),
      { assertConfigured: () => undefined } as unknown as OtpDeliveryService,
    );
    const results = await Promise.allSettled([
      service.verify(pair.challenge.id, '123456'),
      service.verify(pair.challenge.id, '123456'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const token = (
      results.find(
        (result) => result.status === 'fulfilled',
      ) as PromiseFulfilledResult<{ verificationToken: string }>
    ).value.verificationToken;
    const consumed = await Promise.allSettled([
      service.consumeVerification(token, input.sender),
      service.consumeVerification(token, input.sender),
    ]);
    expect(
      consumed.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await otp.reap();
    expect(
      await db.query(
        `SELECT encrypted_code FROM whatsapp_message_outbox WHERE id=$1`,
        [pair.delivery.id],
      ),
    ).toEqual([{ encrypted_code: null }]);
  });

  it('persists duplicate delivery once across concurrent ingestion', async () => {
    await Promise.all([repository.ingest(input), repository.ingest(input)]);
    expect(
      await db
        .getRepository(WhatsAppTurn)
        .count({ where: { messageId: input.messageId } }),
    ).toBe(1);
    const conversation = await db
      .getRepository(WhatsAppConversation)
      .findOneByOrFail({ connectionId: input.connectionId });
    expect(conversation.nextSequence).toBe(2);
  });

  it('claims one ordered turn per conversation and obeys replica-wide capacity', async () => {
    await repository.ingest(input);
    await repository.ingest({
      ...input,
      messageId: randomUUID(),
      body: 'Second message',
    });
    const replica = new WhatsAppHarnessRepository(db);
    const results = await Promise.all([repository.claim(1), replica.claim(1)]);
    const claimed = results.flat();
    expect(claimed).toHaveLength(1);
    expect(claimed[0].body).toBe('Hello');
    // Leave this test's turn terminal so it does not consume subsequent capacity.
    await repository.fail(claimed[0].id, claimed[0].leaseToken!, 'test');
    await db
      .getRepository(WhatsAppTurn)
      .update(
        { conversationId: claimed[0].conversationId },
        { status: 'cancelled' },
      );
  });

  it('commits a reply once, blocks the next turn until send acceptance, and survives a new repository instance', async () => {
    await repository.ingest(input);
    const [turn] = await repository.claim(100);
    const checkpoint = {
      session: {
        state: { name: 'Priya' },
        events: [
          { id: 'answer', content: { parts: [{ text: 'Hello Priya' }] } },
        ],
      },
      reply: 'Hello Priya',
    };
    await Promise.all([
      repository.complete(turn.id, turn.leaseToken!, checkpoint),
      repository.complete(turn.id, turn.leaseToken!, checkpoint),
    ]);
    expect(
      await db
        .getRepository(WhatsAppOutbox)
        .count({ where: { turnId: turn.id } }),
    ).toBe(1);
    await repository.ingest({
      ...input,
      messageId: randomUUID(),
      body: 'Book tomorrow',
    });
    expect(
      (await repository.claim(100)).some(
        (item) => item.conversationId === turn.conversationId,
      ),
    ).toBe(false);
    const outbox = await db
      .getRepository(WhatsAppOutbox)
      .findOneByOrFail({ turnId: turn.id });
    await db
      .getRepository(WhatsAppOutbox)
      .update(outbox.id, { status: 'accepted' });
    const next = (await new WhatsAppHarnessRepository(db).claim(100)).find(
      (item) => item.conversationId === turn.conversationId,
    )!;
    expect(next.baseSession).toEqual(checkpoint.session);
    await db
      .getRepository(WhatsAppTurn)
      .update(next.id, { status: 'cancelled' });
  });

  it('does not let an older failed or delayed conversation starve another sender', async () => {
    await repository.ingest(input);
    const first = await db
      .getRepository(WhatsAppTurn)
      .findOneByOrFail({ messageId: input.messageId });
    await repository.ingest({
      ...input,
      messageId: randomUUID(),
      body: 'Later message',
    });
    await db.getRepository(WhatsAppTurn).update(first.id, { status: 'failed' });
    await repository.ingest({
      ...input,
      sender: '919876543211',
      messageId: randomUUID(),
    });
    await db
      .getRepository(WhatsAppConversation)
      .update(first.conversationId, { updatedAt: new Date(0) });
    const [other] = await repository.claim(1);
    expect(other.conversationId).not.toBe(first.conversationId);
    await db
      .getRepository(WhatsAppTurn)
      .update(other.id, { status: 'cancelled' });
    await db.getRepository(WhatsAppTurn).update(first.id, {
      status: 'pending',
      nextAttemptAt: new Date(Date.now() + 60_000),
    });
    await repository.ingest({
      ...input,
      sender: '919876543212',
      messageId: randomUUID(),
    });
    const [third] = await repository.claim(1);
    expect(third.conversationId).not.toBe(first.conversationId);
  });

  it('serializes simultaneous manual retries and refuses the second retry after state changes', async () => {
    await repository.ingest(input);
    const turn = await db
      .getRepository(WhatsAppTurn)
      .findOneByOrFail({ messageId: input.messageId });
    await db.getRepository(WhatsAppTurn).update(turn.id, { status: 'failed' });
    const results = await Promise.allSettled([
      repository.retry(input.organizationId, turn.id),
      repository.retry(input.organizationId, turn.id),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      (await db.getRepository(WhatsAppTurn).findOneByOrFail({ id: turn.id }))
        .status,
    ).toBe('pending');
  });

  it('reclaims a dead worker while retaining final checkpoint and rejects the old lease', async () => {
    await repository.ingest(input);
    const turn = (await repository.claim(100)).find(
      (item) => item.phoneNumberId === input.phoneNumberId,
    )!;
    const checkpoint = {
      session: { state: {}, events: [] },
      reply: 'A persisted reply',
    };
    await repository.checkpoint(turn.id, turn.leaseToken!, checkpoint);
    await db
      .getRepository(WhatsAppTurn)
      .update(turn.id, { leaseExpiresAt: new Date(Date.now() - 1) });
    await repository.reap();
    await db
      .getRepository(WhatsAppTurn)
      .update(turn.id, { nextAttemptAt: new Date(Date.now() - 1) });
    const next = (await repository.claim(100)).find(
      (item) => item.id === turn.id,
    )!;
    expect(next.checkpoint).toEqual(checkpoint);
    expect(next.leaseToken).not.toBe(turn.leaseToken);
    await expect(
      repository.complete(turn.id, turn.leaseToken!, checkpoint),
    ).rejects.toBeInstanceOf(ConflictException);
    await db
      .getRepository(WhatsAppTurn)
      .update(next.id, { status: 'cancelled' });
  });

  it('reset fences an in-flight worker, clears memory, and creates one canned reply even on retries', async () => {
    await repository.ingest(input);
    const turn = (await repository.claim(100)).find(
      (item) => item.phoneNumberId === input.phoneNumberId,
    )!;
    const reset = { ...input, messageId: randomUUID(), body: ' /NEW ' };
    await Promise.all([repository.ingest(reset), repository.ingest(reset)]);
    const conversation = await repository.getConversation(turn.conversationId);
    expect(conversation.generation).toBe(2);
    expect(conversation.session).toEqual({ state: {}, events: [] });
    await expect(
      repository.complete(turn.id, turn.leaseToken!, {
        session: { state: {}, events: [] },
        reply: 'Old reply',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const resetTurn = await db
      .getRepository(WhatsAppTurn)
      .findOneByOrFail({ messageId: reset.messageId });
    expect(
      await db
        .getRepository(WhatsAppOutbox)
        .count({ where: { turnId: resetTurn.id } }),
    ).toBe(1);
    await db
      .getRepository(WhatsAppOutbox)
      .update({ turnId: resetTurn.id }, { status: 'accepted' });
  });

  it('does not resend an ambiguous crashed send', async () => {
    await repository.ingest(input);
    const turn = (await repository.claim(100)).find(
      (item) => item.phoneNumberId === input.phoneNumberId,
    )!;
    await repository.complete(turn.id, turn.leaseToken!, {
      session: { state: {}, events: [] },
      reply: 'Reply',
    });
    await db
      .getRepository(WhatsAppOutbox)
      .update(
        { turnId: turn.id },
        { status: 'sending', sendStartedAt: new Date(Date.now() - 70_000) },
      );
    await repository.reap();
    expect(
      (
        await db
          .getRepository(WhatsAppOutbox)
          .findOneByOrFail({ turnId: turn.id })
      ).status,
    ).toBe('uncertain');
    const outbox = await db
      .getRepository(WhatsAppOutbox)
      .findOneByOrFail({ turnId: turn.id });
    await expect(
      repository.resolveSend(input.organizationId, outbox.id, 'retry'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repository.resolveSend(randomUUID(), outbox.id, 'failed'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await repository.resolveSend(input.organizationId, outbox.id, 'failed');
    await repository.resolveSend(input.organizationId, outbox.id, 'retry');
    expect(
      (
        await db
          .getRepository(WhatsAppOutbox)
          .findOneByOrFail({ turnId: turn.id })
      ).status,
    ).toBe('pending');
  });

  it('persists tool receipts before external work and reuses a completed receipt', async () => {
    await repository.ingest(input);
    const turn = (await repository.claim(100)).find(
      (item) => item.phoneNumberId === input.phoneNumberId,
    )!;
    const first = await repository.reserveTool(
      turn.id,
      turn.leaseToken!,
      'booking-key',
      'scheduleGhlMeeting',
      () => undefined,
    );
    const duplicate = await repository.reserveTool(
      turn.id,
      turn.leaseToken!,
      'booking-key',
      'scheduleGhlMeeting',
      () => undefined,
    );
    expect(first.fresh).toBe(true);
    expect(duplicate.fresh).toBe(false);
    expect(duplicate.operation.status).toBe('running');
    await repository.finishTool(
      first.operation,
      { ok: true, appointmentId: 'appointment' },
      (conversation) => {
        conversation.toolState.booked = true;
      },
    );
    expect(
      (
        await repository.reserveTool(
          turn.id,
          turn.leaseToken!,
          'booking-key',
          'scheduleGhlMeeting',
          () => undefined,
        )
      ).operation.result,
    ).toEqual({ ok: true, appointmentId: 'appointment' });
    expect(
      await db
        .getRepository(WhatsAppToolOperation)
        .count({ where: { conversationId: turn.conversationId } }),
    ).toBe(1);
    await db
      .getRepository(WhatsAppTurn)
      .update(turn.id, { status: 'cancelled' });
  });

  it('hides another org conversation and rejects cross-org retry', async () => {
    await repository.ingest(input);
    const conversation = await db
      .getRepository(WhatsAppConversation)
      .findOneByOrFail({ connectionId: input.connectionId });
    const turn = await db
      .getRepository(WhatsAppTurn)
      .findOneByOrFail({ messageId: input.messageId });
    await expect(
      repository.inspect(randomUUID(), conversation.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      repository.retry(randomUUID(), turn.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('boots the real module graph, exposes Swagger callbacks and durably ingests through HTTP', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              JWT_SECRET: 'harness-test-jwt-secret',
              ADMIN_EMAIL: 'harness@test.invalid',
              ADMIN_PASSWORD: 'harness-test-password',
              LIVEKIT_URL: 'http://127.0.0.1:9',
              LIVEKIT_API_KEY: 'test',
              LIVEKIT_API_SECRET: 'test',
              WORKER_CALLBACK_SECRET: 'test-worker-secret',
              WHATSAPP_WORKER_URL: 'http://127.0.0.1:9',
              QUEUE_DIALER_ENABLED: 'false',
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl,
          schema: 'harness_test',
          extra: { options: '-c search_path=harness_test,public' },
          entities: getMetadataArgsStorage().tables.map(
            (table) => table.target as Function,
          ),
          synchronize: false,
        }),
        ScheduleModule.forRoot(),
        GhlModule,
        EmailModule,
        AuthModule,
        WhatsappModule,
        OtpModule,
      ],
    })
      .overrideProvider(WhatsAppTickerService)
      .useValue({ health: () => ({ enabled: true }) })
      .compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    try {
      await app.init();
      const swagger = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      expect(
        swagger.paths['/api/internal/whatsapp/turns/{id}/complete'],
      ).toBeDefined();
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: input.phoneNumberId },
                  messages: [
                    {
                      id: input.messageId,
                      from: input.sender,
                      type: 'text',
                      text: { body: input.body },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .send(body)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/webhooks/whatsapp')
        .send(body)
        .expect(200);
      expect(
        await db
          .getRepository(WhatsAppTurn)
          .count({ where: { messageId: input.messageId } }),
      ).toBe(1);
      const turn = await db
        .getRepository(WhatsAppTurn)
        .findOneByOrFail({ messageId: input.messageId });
      await request(app.getHttpServer())
        .post(`/api/internal/whatsapp/turns/${turn.id}/heartbeat`)
        .send({ leaseToken: randomUUID() })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/internal/whatsapp/turns/${turn.id}/heartbeat`)
        .set('X-Worker-Secret', 'test-worker-secret')
        .send({ leaseToken: randomUUID() })
        .expect(409);
      await request(app.getHttpServer())
        .get('/api/users/whatsapp/conversations')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/admin/whatsapp/otp-deliveries')
        .expect(401);
      const member = await db.getRepository(User).save({
        organizationId: input.organizationId,
        email: `${randomUUID()}@test.invalid`,
        passwordHash: null,
        isActive: true,
        role: 'org_admin',
      });
      const jwt = module.get(JwtService);
      const orgToken = jwt.sign({ sub: member.id, typ: 'user' });
      await request(app.getHttpServer())
        .get('/api/admin/whatsapp/conversations')
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/admin/whatsapp/otp-deliveries')
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(403);
      const admin = await db
        .getRepository(Admin)
        .findOneByOrFail({ email: 'harness@test.invalid' });
      const adminToken = jwt.sign({ sub: admin.id, typ: 'admin' });
      await request(app.getHttpServer())
        .get('/api/admin/whatsapp/conversations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200, []);
      expect(swagger.paths['/api/otp/send']).toBeDefined();
      expect(
        swagger.paths['/api/admin/whatsapp/messages/{id}/resolve'],
      ).toBeDefined();
    } finally {
      await app.close();
    }
  }, 30_000);
});

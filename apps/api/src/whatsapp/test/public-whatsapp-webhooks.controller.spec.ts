import {
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { OrganizationsService } from '../../organizations/organizations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserGuard } from '../../auth/guards/user.guard';
import { WhatsAppAgentService } from '../../whatsapp-agent/whatsapp-agent.service';
import { PublicWhatsAppWebhooksController } from '../public-whatsapp-webhooks.controller';
import { hashVerifyToken } from '../verify-token.util';
import { WhatsAppWebhookConfigsRepository } from '../whatsapp-webhook-configs.repository';
import { WhatsAppWebhookEventsRepository } from '../whatsapp-webhook-events.repository';
import { WhatsAppWebhooksService } from '../whatsapp-webhooks.service';

describe('PublicWhatsAppWebhooksController (HTTP)', () => {
  let app: INestApplication;
  let configs: {
    findByVerifyTokenHash: jest.Mock;
    findActiveByPhoneNumberId: jest.Mock;
    findActiveByWabaId: jest.Mock;
  };
  let events: { create: jest.Mock; save: jest.Mock };

  const TOKEN = 'wa_meta_verify_secret';
  const TOKEN_HASH = hashVerifyToken(TOKEN);
  const CHALLENGE = '1158201444';

  beforeAll(async () => {
    configs = {
      findByVerifyTokenHash: jest.fn(),
      findActiveByPhoneNumberId: jest.fn().mockResolvedValue(null),
      findActiveByWabaId: jest.fn().mockResolvedValue(null),
    };
    events = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (row) => ({ id: 'evt-id', ...row })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PublicWhatsAppWebhooksController],
      providers: [
        WhatsAppWebhooksService,
        { provide: WhatsAppWebhookConfigsRepository, useValue: configs },
        { provide: WhatsAppWebhookEventsRepository, useValue: events },
        {
          provide: OrganizationsService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'API_BASE_URL' ? 'https://api.example.com' : undefined,
            ),
          },
        },
        {
          provide: WhatsAppAgentService,
          useValue: { replyToWebhook: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    configs.findByVerifyTokenHash.mockReset();
    configs.findActiveByPhoneNumberId.mockReset();
    configs.findActiveByWabaId.mockReset();
    configs.findActiveByPhoneNumberId.mockResolvedValue(null);
    configs.findActiveByWabaId.mockResolvedValue(null);
    events.create.mockClear();
    events.save.mockClear();
    configs.findByVerifyTokenHash.mockImplementation(async (hash: string) =>
      hash === TOKEN_HASH
        ? { isActive: true, verifyTokenHash: TOKEN_HASH }
        : null,
    );
  });

  it('does not register JwtAuthGuard or UserGuard on the public controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PublicWhatsAppWebhooksController,
    );
    expect(guards ?? []).toEqual([]);
    expect(guards ?? []).not.toEqual(
      expect.arrayContaining([JwtAuthGuard, UserGuard]),
    );
  });

  it('GET /api/webhooks/whatsapp echoes hub.challenge as text/plain without JWT', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TOKEN)}&hub.challenge=${CHALLENGE}`,
      )
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe(CHALLENGE);
    expect(res.text).not.toMatch(/^"/);
    expect(configs.findByVerifyTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
  });

  it('GET still succeeds when a Bearer token is present (Meta sends none)', async () => {
    await request(app.getHttpServer())
      .get('/api/webhooks/whatsapp')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': TOKEN,
        'hub.challenge': CHALLENGE,
      })
      .expect(200)
      .expect(CHALLENGE);
  });

  it('GET returns 403 JSON when the verify token does not match', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wa_wrong',
        'hub.challenge': CHALLENGE,
      })
      .expect(403);

    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Verification failed',
    });
  });

  it('GET returns 403 when hub.mode is not subscribe', async () => {
    await request(app.getHttpServer())
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': TOKEN,
        'hub.challenge': CHALLENGE,
      })
      .expect(403);
  });

  it('POST /api/webhooks/whatsapp still persists the payload and returns 200', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '102290129340398',
          changes: [
            {
              field: 'messages',
              value: { metadata: { phone_number_id: '106540352242922' } },
            },
          ],
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/webhooks/whatsapp')
      .send(payload)
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(events.save).toHaveBeenCalledTimes(1);
    expect(events.save.mock.calls[0][0].payload).toEqual(payload);
    expect(events.save.mock.calls[0][0].eventType).toBe('messages');
  });

  it('POST persists an array body and a non-array entry', async () => {
    await request(app.getHttpServer())
      .post('/api/webhooks/whatsapp')
      .send([{ field: 'messages' }])
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/webhooks/whatsapp')
      .send({ entry: {} })
      .expect(200);

    expect(events.save).toHaveBeenCalledTimes(2);
    expect(events.save.mock.calls[0][0].payload).toEqual([{ field: 'messages' }]);
    expect(events.save.mock.calls[1][0].payload).toEqual({ entry: {} });
  });
});

describe('PublicWhatsAppWebhooksController verify wiring', () => {
  it('passes parsed hub query into verifySubscription', async () => {
    const verifySubscription = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Verification failed'));
    const module = await Test.createTestingModule({
      controllers: [PublicWhatsAppWebhooksController],
      providers: [
        { provide: WhatsAppWebhooksService, useValue: { verifySubscription } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    await request(app.getHttpServer())
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wa_x',
        'hub.challenge': '1',
      })
      .expect(403);

    expect(verifySubscription).toHaveBeenCalledWith(
      'subscribe',
      'wa_x',
      '1',
    );
    await app.close();
  });
});

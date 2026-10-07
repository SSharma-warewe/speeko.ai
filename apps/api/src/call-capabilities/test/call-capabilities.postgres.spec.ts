import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  AgentDirection,
  CallMedium,
  IntegrationProvider,
  TOOL_IDS,
  VOICE_TASK_STARTERS,
} from '@call-agent/contracts';
import { CallCapabilitiesModule } from '../call-capabilities.module';
import { CallCapabilityAuthorizationService } from '../call-capability-authorization.service';
import { Call } from '../../calls/call.entity';
import { CallsRepository } from '../../calls/calls.repository';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { Agent } from '../../agents/agent.entity';
import { OrganizationIntegration } from '../../organization-integrations/organization-integration.entity';
import { ToolProfile } from '../../tools/tool-profile.entity';
import { ToolProfileTool } from '../../tools/tool-profile-tool.entity';
import { GhlCalendarToolsService } from '../../ghl/ghl-calendar-tools.service';
import { InternalGhlCalendarController } from '../../ghl/internal-ghl-calendar.controller';
import { GhlService } from '../../ghl/ghl.service';
import { CalendarToolsService } from '../../organization-integrations/calendar-tools.service';
import { InternalCalendarController } from '../../organization-integrations/internal-calendar.controller';
import { NylasService } from '../../organization-integrations/nylas.service';
import { WorkerSecretGuard } from '../../auth/guards/worker-secret.guard';
import { AuthModule } from '../../auth/auth.module';
import { PasswordLifecycleService } from '../../auth/password-lifecycle.service';
import { GhlModule } from '../../ghl/ghl.module';
import { OrganizationIntegrationsModule } from '../../organization-integrations/organization-integrations.module';
import { EmailModule } from '../../email/email.module';
import { EmailService } from '../../email/email.service';
import { LivekitService } from '../../livekit/livekit.service';
import {
  securityDatabase,
  securityDatabaseUrl,
} from '../../common/test/api-security-database';

const operations = [
  {
    tool: TOOL_IDS.checkGhlFreeSlots,
    provider: IntegrationProvider.GHL,
    path: 'ghl-calendar/free-slots',
    upstream: 'getFreeSlots',
  },
  {
    tool: TOOL_IDS.lookupGhlContact,
    provider: IntegrationProvider.GHL,
    path: 'ghl-calendar/contacts/lookup',
    upstream: 'lookupContact',
  },
  {
    tool: TOOL_IDS.upsertGhlContact,
    provider: IntegrationProvider.GHL,
    path: 'ghl-calendar/contacts',
    upstream: 'upsertContact',
  },
  {
    tool: TOOL_IDS.scheduleGhlMeeting,
    provider: IntegrationProvider.GHL,
    path: 'ghl-calendar/appointments',
    upstream: 'createAppointment',
  },
  {
    tool: TOOL_IDS.checkCalendarAvailability,
    provider: IntegrationProvider.NYLAS,
    path: 'calendar/free-busy',
    upstream: 'freeBusy',
  },
  {
    tool: TOOL_IDS.listCalendarEvents,
    provider: IntegrationProvider.NYLAS,
    path: 'calendar/events/list',
    upstream: 'listEvents',
  },
  {
    tool: TOOL_IDS.createCalendarEvent,
    provider: IntegrationProvider.NYLAS,
    path: 'calendar/events',
    upstream: 'createEvent',
  },
  {
    tool: TOOL_IDS.cancelCalendarEvent,
    provider: IntegrationProvider.NYLAS,
    path: 'calendar/events/cancel',
    upstream: 'deleteEvent',
  },
] as const;

(securityDatabaseUrl ? describe : describe.skip)(
  'Live calendar authorization with isolated PostgreSQL',
  () => {
    let db: DataSource,
      app: INestApplication,
      authorization: CallCapabilityAuthorizationService;
    const orgId = randomUUID(),
      foreignOrgId = randomUUID(),
      templateId = randomUUID(),
      agentId = randomUUID(),
      profileId = randomUUID(),
      calendarId = randomUUID(),
      callId = randomUUID();
    const secret = 'fixture-worker-secret';
    const ghl = {
      getFreeSlots: jest.fn(),
      lookupContact: jest.fn(),
      upsertContact: jest.fn(),
      createAppointment: jest.fn(),
    };
    const nylas = {
      freeBusy: jest.fn(),
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };
    const calls = {
      save: jest.fn(async (call: Call) => {
        await db.getRepository(Call).update(call.id, { context: call.context });
        return call;
      }),
    };
    const startTime = new Date(Date.now() + 172800000).toISOString(),
      endTime = new Date(Date.now() + 176400000).toISOString();
    const bodyFor = (tool: string) =>
      tool === TOOL_IDS.listCalendarEvents
        ? {}
        : tool === TOOL_IDS.cancelCalendarEvent
          ? { eventId: 'fixture-event' }
          : tool === TOOL_IDS.lookupGhlContact ||
              tool === TOOL_IDS.upsertGhlContact
            ? { participantEmail: 'person@example.invalid' }
            : tool === TOOL_IDS.scheduleGhlMeeting
              ? { startTime, endTime, contactId: 'fixture-contact' }
              : tool === TOOL_IDS.createCalendarEvent
                ? { startTime, endTime, title: 'Fixture meeting' }
                : { startTime, endTime };
    beforeAll(async () => {
      db = (await securityDatabase('call_capability_test')).db;
      const module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({ ...db.options, synchronize: false }),
          CallCapabilitiesModule,
        ],
        controllers: [
          InternalGhlCalendarController,
          InternalCalendarController,
        ],
        providers: [
          GhlCalendarToolsService,
          CalendarToolsService,
          WorkerSecretGuard,
          {
            provide: ConfigService,
            useValue: new ConfigService({ WORKER_CALLBACK_SECRET: secret }),
          },
          { provide: CallsRepository, useValue: calls },
          { provide: GhlService, useValue: ghl },
          { provide: NylasService, useValue: nylas },
        ],
      }).compile();
      app = module.createNestApplication();
      app.useLogger(false);
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.init();
      authorization = app.get(CallCapabilityAuthorizationService);
    }, 60000);
    afterAll(async () => {
      if (app) await app.close();
      if (db?.isInitialized) await db.destroy();
    });
    beforeEach(async () => {
      jest.clearAllMocks();
      await db.query(
        'TRUNCATE calls, organization_agents, agents, organization_integrations, tool_profile_tools, tool_profiles, organizations CASCADE',
      );
      await db.getRepository(Organization).save([
        {
          id: orgId,
          name: 'Calendar A',
          slug: 'calendar-a',
          allowedToolIds: null,
          isActive: true,
        },
        {
          id: foreignOrgId,
          name: 'Calendar B',
          slug: 'calendar-b',
          isActive: true,
        },
      ]);
      await db.getRepository(ToolProfile).save({
        id: profileId,
        organizationId: orgId,
        key: 'calendar',
        name: 'Calendar',
      });
      await db
        .getRepository(ToolProfileTool)
        .save(operations.map((op) => ({ profileId, toolId: op.tool })));
      await db.getRepository(Agent).save({
        id: templateId,
        key: 'fixture',
        name: 'Fixture',
        direction: AgentDirection.OUTBOUND,
        systemPrompt: 'Fixture persona',
        defaultToolProfileId: profileId,
        isActive: true,
      });
      await db.getRepository(OrganizationIntegration).save({
        id: calendarId,
        organizationId: orgId,
        provider: IntegrationProvider.GHL,
        name: 'Fixture',
        apiKey: 'fixture-calendar-key',
        apiKeyPrefix: 'fixture',
        locationId: 'fixture-location',
        calendarId: 'fixture-calendar',
        grantId: 'fixture-grant',
        email: 'calendar@example.invalid',
        isActive: true,
      });
      await db.getRepository(OrganizationAgent).save({
        id: agentId,
        organizationId: orgId,
        agentId: templateId,
        name: 'Fixture',
        slug: 'fixture',
        systemPrompt: 'Fixture persona',
        toolProfileId: profileId,
        calendarIntegrationId: calendarId,
        isActive: true,
      });
      await db.getRepository(Call).save({
        id: callId,
        organizationId: orgId,
        organizationAgentId: agentId,
        agentId: templateId,
        direction: AgentDirection.OUTBOUND,
        medium: CallMedium.SIP,
        context: { ghlContactId: 'fixture-contact' },
      });
      ghl.getFreeSlots.mockResolvedValue({
        ok: true,
        slotMinutes: 30,
        timezone: 'UTC',
        slots: [{ startIso: startTime, endIso: endTime }],
      });
      ghl.lookupContact.mockResolvedValue({
        ok: true,
        found: true,
        contactId: 'fixture-contact',
      });
      ghl.upsertContact.mockResolvedValue({
        ok: true,
        contactId: 'fixture-contact',
        created: true,
      });
      ghl.createAppointment.mockResolvedValue({
        ok: true,
        appointmentId: 'fixture-appointment',
      });
      nylas.freeBusy.mockResolvedValue({ ok: true, data: [{ timeSlots: [] }] });
      nylas.listEvents.mockResolvedValue({ ok: true, data: [] });
      nylas.createEvent.mockResolvedValue({
        ok: true,
        data: { id: 'fixture-event' },
      });
      nylas.deleteEvent.mockResolvedValue({ ok: true });
    });

    const invoke = (
      op: (typeof operations)[number],
      workerSecret: string | null = secret,
    ) => {
      const call = request(app.getHttpServer()).post(
        `/internal/calls/${callId}/${op.path}`,
      );
      if (workerSecret !== null) call.set('X-Worker-Secret', workerSecret);
      return call.send(bodyFor(op.tool));
    };
    const authorize = () =>
      authorization.authorizeCalendarTool(
        callId,
        TOOL_IDS.checkGhlFreeSlots,
        IntegrationProvider.GHL,
      );

    it('constructs the actual auth and calendar module graph without dependency cycles', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            load: [
              () => ({
                JWT_SECRET: 'fixture-jwt-secret',
                WORKER_CALLBACK_SECRET: secret,
              }),
            ],
          }),
          TypeOrmModule.forRoot({ ...db.options, synchronize: false }),
          EmailModule,
          AuthModule,
          GhlModule,
          OrganizationIntegrationsModule,
        ],
      })
        .overrideProvider(LivekitService)
        .useValue({})
        .overrideProvider(EmailService)
        .useValue({ send: jest.fn() })
        .overrideProvider(GhlService)
        .useValue(ghl)
        .overrideProvider(NylasService)
        .useValue(nylas)
        .compile();
      try {
        expect(module.get(PasswordLifecycleService)).toBeDefined();
        expect(module.get(GhlCalendarToolsService)).toBeDefined();
        expect(module.get(CalendarToolsService)).toBeDefined();
        expect(module.get(CallCapabilityAuthorizationService)).toBeDefined();
      } finally {
        await module.close();
      }
    });

    it.each(operations)(
      'authorizes and revokes $tool at its HTTP operation',
      async (op) => {
        await db
          .getRepository(OrganizationIntegration)
          .update(calendarId, { provider: op.provider });
        // Only this operation is assigned, so a wrong fixed tool id must fail.
        await db
          .getRepository(Organization)
          .update(orgId, { allowedToolIds: [op.tool] });
        const upstream = op.provider === IntegrationProvider.GHL ? ghl : nylas;
        const method = upstream[
          op.upstream as keyof typeof upstream
        ] as jest.Mock;
        const success = await invoke(op);
        expect(success.status).toBe(200);
        expect(success.body.ok).toBe(true);
        expect(method).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(success.body)).not.toContain(
          'fixture-calendar-key',
        );
        await db
          .getRepository(Organization)
          .update(orgId, { allowedToolIds: ['endCall'] });
        const prior = (
          await db.getRepository(Call).findOneByOrFail({ id: callId })
        ).context;
        const writesBeforeDenial = calls.save.mock.calls.length;
        const denied = await invoke(op);
        expect(denied.status).toBe(200);
        expect(denied.body).toMatchObject({
          ok: false,
          error: 'tool_not_allowed',
        });
        expect(method).toHaveBeenCalledTimes(1);
        expect(calls.save).toHaveBeenCalledTimes(writesBeforeDenial);
        expect(
          (await db.getRepository(Call).findOneByOrFail({ id: callId }))
            .context,
        ).toEqual(prior);
        expect(JSON.stringify(denied.body)).not.toContain(
          'fixture-calendar-key',
        );
      },
    );

    it.each(['organization', 'agent', 'template', 'integration'])(
      'blocks an inactive %s without I/O or context writes',
      async (target) => {
        if (target === 'organization')
          await db
            .getRepository(Organization)
            .update(orgId, { isActive: false });
        if (target === 'agent')
          await db
            .getRepository(OrganizationAgent)
            .update(agentId, { isActive: false });
        if (target === 'template')
          await db.getRepository(Agent).update(templateId, { isActive: false });
        if (target === 'integration')
          await db
            .getRepository(OrganizationIntegration)
            .update(calendarId, { isActive: false });
        expect((await invoke(operations[2])).body.ok).toBe(false);
        expect(ghl.upsertContact).not.toHaveBeenCalled();
        expect(calls.save).not.toHaveBeenCalled();
      },
    );

    it('rejects foreign profiles, agents and integrations', async () => {
      await db
        .getRepository(ToolProfile)
        .update(profileId, { organizationId: foreignOrgId });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
      await db
        .getRepository(ToolProfile)
        .update(profileId, { organizationId: orgId });
      await db
        .getRepository(OrganizationIntegration)
        .update(calendarId, { organizationId: foreignOrgId });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'integration_not_found',
      });
      await db
        .getRepository(OrganizationIntegration)
        .update(calendarId, { organizationId: orgId });
      await db
        .getRepository(OrganizationAgent)
        .update(agentId, { organizationId: foreignOrgId });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'agent_not_found',
      });
    });

    it('uses live profile membership and reassignment', async () => {
      expect((await authorize()).ok).toBe(true);
      await db
        .getRepository(ToolProfileTool)
        .delete({ profileId, toolId: TOOL_IDS.checkGhlFreeSlots });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
      const replacement = await db.getRepository(ToolProfile).save({
        key: 'replacement',
        name: 'Replacement',
        organizationId: orgId,
      });
      await db.getRepository(ToolProfileTool).save({
        profileId: replacement.id,
        toolId: TOOL_IDS.checkGhlFreeSlots,
      });
      await db
        .getRepository(OrganizationAgent)
        .update(agentId, { toolProfileId: replacement.id });
      expect((await authorize()).ok).toBe(true);
    });

    it('preserves inbound SIP and web/outbound fallback precedence', async () => {
      await db
        .getRepository(OrganizationAgent)
        .update(agentId, { toolProfileId: null });
      expect((await authorize()).ok).toBe(true);
      await db
        .getRepository(Call)
        .update(callId, { direction: AgentDirection.INBOUND });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
      await db.getRepository(Call).update(callId, { medium: CallMedium.WEB });
      expect((await authorize()).ok).toBe(true);
    });

    it('preserves null allowlists and does not repair explicit lists during authorization', async () => {
      expect((await authorize()).ok).toBe(true);
      await db
        .getRepository(Organization)
        .update(orgId, { allowedToolIds: [] });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
      expect(
        (await db.getRepository(Organization).findOneByOrFail({ id: orgId }))
          .allowedToolIds,
      ).toEqual([]);
      await db
        .getRepository(Organization)
        .update(orgId, { allowedToolIds: [TOOL_IDS.checkGhlFreeSlots] });
      expect((await authorize()).ok).toBe(true);
      expect(
        (await db.getRepository(Organization).findOneByOrFail({ id: orgId }))
          .allowedToolIds,
      ).toEqual([TOOL_IDS.checkGhlFreeSlots]);
    });

    it('accepts platform profiles but rejects empty profiles and legacy aliases', async () => {
      await db
        .getRepository(ToolProfile)
        .update(profileId, { organizationId: null });
      const result = await authorize();
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(Object.keys(result.call)).toEqual(['id', 'context']);
      await db.getRepository(ToolProfileTool).delete({ profileId });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
      await db.getRepository(ToolProfileTool).save([
        { profileId, toolId: TOOL_IDS.booking },
        { profileId, toolId: TOOL_IDS.cancelBooking },
      ]);
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
    });

    it.each([IntegrationProvider.GHL, IntegrationProvider.NYLAS])(
      'rejects incomplete %s credentials without upstream calls',
      async (provider) => {
        await db
          .getRepository(OrganizationIntegration)
          .update(calendarId, { provider, apiKey: '' });
        const op =
          provider === IntegrationProvider.GHL ? operations[2] : operations[6];
        expect((await invoke(op)).body).toMatchObject({
          ok: false,
          error: `${provider}_incomplete`,
        });
        expect(ghl.upsertContact).not.toHaveBeenCalled();
        expect(nylas.createEvent).not.toHaveBeenCalled();
        expect(calls.save).not.toHaveBeenCalled();
      },
    );

    it('uses a persisted task snapshot without resolving newer or archived definitions', async () => {
      const snapshot = {
        schemaVersion: 1 as const,
        taskId: randomUUID(),
        version: 1,
        definition: VOICE_TASK_STARTERS.demo_booking,
      };
      await db
        .getRepository(Call)
        .update(callId, { voiceTaskSnapshot: snapshot });
      expect((await authorize()).ok).toBe(true);
      // There is deliberately no current task row: the pinned historical definition is authoritative.
      await db.getRepository(Call).update(callId, {
        voiceTaskSnapshot: {
          ...snapshot,
          definition: VOICE_TASK_STARTERS.general,
        },
      });
      expect(await authorize()).toMatchObject({
        ok: false,
        error: 'tool_not_allowed',
      });
    });

    it('uses the current authorized calendar and rejects an incompatible replacement', async () => {
      const replacement = await db.getRepository(OrganizationIntegration).save({
        organizationId: orgId,
        provider: IntegrationProvider.GHL,
        name: 'Replacement',
        apiKey: 'fixture-new-key',
        apiKeyPrefix: 'fixture',
        locationId: 'new-location',
        calendarId: 'new-calendar',
        isActive: true,
      });
      await db
        .getRepository(OrganizationAgent)
        .update(agentId, { calendarIntegrationId: replacement.id });
      await invoke(operations[0]);
      expect(ghl.getFreeSlots).toHaveBeenCalledWith(expect.anything(), {
        token: 'fixture-new-key',
        locationId: 'new-location',
        calendarId: 'new-calendar',
      });
      await db
        .getRepository(OrganizationIntegration)
        .update(replacement.id, { provider: IntegrationProvider.NYLAS });
      expect((await invoke(operations[0])).body).toMatchObject({
        ok: false,
        error: 'unsupported_provider',
      });
      expect(ghl.getFreeSlots).toHaveBeenCalledTimes(1);
    });

    it.each([null, 'wrong-secret'])(
      'rejects an invalid worker secret %s',
      async (provided) => {
        expect((await invoke(operations[0], provided)).status).toBe(401);
        expect(ghl.getFreeSlots).not.toHaveBeenCalled();
      },
    );

    it('does not let a worker body choose its capability', async () => {
      const response = await request(app.getHttpServer())
        .post(`/internal/calls/${callId}/ghl-calendar/free-slots`)
        .set('X-Worker-Secret', secret)
        .send({ ...bodyFor(TOOL_IDS.checkGhlFreeSlots), toolId: 'endCall' });
      expect(response.status).toBe(400);
      expect(ghl.getFreeSlots).not.toHaveBeenCalled();
    });
  },
);

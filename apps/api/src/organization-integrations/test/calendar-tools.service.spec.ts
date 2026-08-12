import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { CallsRepository } from '../../calls/calls.repository';
import {
  CalendarToolsService,
  parseTimeToUnix,
} from '../calendar-tools.service';
import {
  IntegrationProvider,
  OrganizationIntegration,
} from '../organization-integration.entity';
import { OrganizationIntegrationsService } from '../organization-integrations.service';
import { NylasService } from '../nylas.service';

describe('CalendarToolsService', () => {
  let service: CalendarToolsService;
  let callsRepository: { findById: jest.Mock };
  let organizationAgentsService: { getEntityWithTemplate: jest.Mock };
  let organizationIntegrationsService: { getEntityForOrg: jest.Mock };
  let nylas: { freeBusy: jest.Mock };

  const CALL_ID = 'call-id';
  const ORG_ID = 'org-id';
  const AGENT_ID = 'org-agent-id';
  const INT_ID = 'int-id';

  const futureStart = Math.floor(Date.now() / 1000) + 3600;
  const futureEnd = futureStart + 3600;

  const callRow = {
    id: CALL_ID,
    organizationId: ORG_ID,
    organizationAgentId: AGENT_ID,
  };

  const orgAgent = {
    id: AGENT_ID,
    organizationId: ORG_ID,
    calendarIntegrationId: INT_ID,
  };

  const integration: OrganizationIntegration = {
    id: INT_ID,
    organizationId: ORG_ID,
    provider: IntegrationProvider.NYLAS,
    name: 'Clinic Calendar',
    apiKey: 'nyk_secret',
    apiKeyPrefix: 'nyk_secr…',
    grantId: 'grant-1',
    calendarId: 'primary',
    apiUri: 'https://api.us.nylas.com',
    email: 'clinic@example.com',
    isActive: true,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as OrganizationIntegration;

  beforeEach(async () => {
    callsRepository = { findById: jest.fn() };
    organizationAgentsService = { getEntityWithTemplate: jest.fn() };
    organizationIntegrationsService = { getEntityForOrg: jest.fn() };
    nylas = { freeBusy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarToolsService,
        { provide: CallsRepository, useValue: callsRepository },
        {
          provide: OrganizationAgentsService,
          useValue: organizationAgentsService,
        },
        {
          provide: OrganizationIntegrationsService,
          useValue: organizationIntegrationsService,
        },
        { provide: NylasService, useValue: nylas },
      ],
    }).compile();

    service = module.get(CalendarToolsService);
  });

  function mockResolvedHappyPath(
    overrides: {
      call?: Partial<typeof callRow> | null;
      agent?: Partial<typeof orgAgent> | null;
      integration?: OrganizationIntegration | null;
    } = {},
  ) {
    if (overrides.call === null) {
      callsRepository.findById.mockResolvedValue(null);
      return;
    }
    callsRepository.findById.mockResolvedValue({
      ...callRow,
      ...overrides.call,
    });

    if (overrides.agent === null) {
      organizationAgentsService.getEntityWithTemplate.mockRejectedValue(
        new NotFoundException('agent missing'),
      );
      return;
    }
    organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
      ...orgAgent,
      ...overrides.agent,
    });

    if (overrides.integration === null) {
      organizationIntegrationsService.getEntityForOrg.mockRejectedValue(
        new NotFoundException('integration missing'),
      );
      return;
    }
    organizationIntegrationsService.getEntityForOrg.mockResolvedValue(
      overrides.integration ?? integration,
    );
  }

  describe('freeBusy — resolve failures', () => {
    it('1. call_not_found when call missing', async () => {
      mockResolvedHappyPath({ call: null });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'call_not_found',
        }),
      );
      expect(nylas.freeBusy).not.toHaveBeenCalled();
    });

    it('2. no_org_agent when call lacks org/agent ids', async () => {
      mockResolvedHappyPath({
        call: { organizationId: null as unknown as string, organizationAgentId: null as unknown as string },
      });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'no_org_agent',
        }),
      );
    });

    it('3. agent_not_found when org agent lookup fails', async () => {
      mockResolvedHappyPath({ agent: null });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'agent_not_found',
        }),
      );
    });

    it('4. calendar_not_linked when agent has no calendarIntegrationId', async () => {
      mockResolvedHappyPath({
        agent: { calendarIntegrationId: null as unknown as string },
      });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'calendar_not_linked',
        }),
      );
    });

    it('5. integration_not_found when linked integration missing', async () => {
      mockResolvedHappyPath({ integration: null });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'integration_not_found',
        }),
      );
    });

    it('6. integration_inactive when calendar connection is off', async () => {
      mockResolvedHappyPath({
        integration: { ...integration, isActive: false },
      });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'integration_inactive',
        }),
      );
      expect(nylas.freeBusy).not.toHaveBeenCalled();
    });
  });

  describe('freeBusy — validation', () => {
    beforeEach(() => {
      mockResolvedHappyPath();
    });

    it('7. invalid_time for non-parseable start/end', async () => {
      const result = await service.freeBusy(CALL_ID, {
        startTime: 'not-a-time',
        endTime: 'also-bad',
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'invalid_time',
        }),
      );
      expect(nylas.freeBusy).not.toHaveBeenCalled();
    });

    it('8. invalid_range when end is not after start', async () => {
      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureEnd),
        endTime: String(futureStart),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'invalid_range',
        }),
      );
    });

    it('9. missing_email when integration and dto have no email', async () => {
      mockResolvedHappyPath({
        integration: { ...integration, email: null },
      });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'missing_email',
        }),
      );
      expect(nylas.freeBusy).not.toHaveBeenCalled();
    });
  });

  describe('freeBusy — happy path', () => {
    it('10. returns busy slots from Nylas on success', async () => {
      mockResolvedHappyPath();
      nylas.freeBusy.mockResolvedValue({
        ok: true,
        data: [
          {
            email: 'clinic@example.com',
            timeSlots: [
              {
                startTime: futureStart + 100,
                endTime: futureStart + 200,
                status: 'busy',
              },
            ],
          },
        ],
      });

      const result = await service.freeBusy(CALL_ID, {
        startTime: String(futureStart),
        endTime: String(futureEnd),
      });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          email: 'clinic@example.com',
          busySlots: [
            expect.objectContaining({
              startTime: futureStart + 100,
              endTime: futureStart + 200,
              status: 'busy',
            }),
          ],
        }),
      );
      expect(nylas.freeBusy).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'nyk_secret',
          grantId: 'grant-1',
          email: 'clinic@example.com',
        }),
        expect.objectContaining({
          startTime: futureStart,
          endTime: futureEnd,
          emails: ['clinic@example.com'],
        }),
      );
    });
  });

  describe('parseTimeToUnix (exported helper)', () => {
    it('11. accepts unix seconds and ISO-8601', () => {
      expect(parseTimeToUnix(String(futureStart))).toBe(futureStart);
      expect(parseTimeToUnix('2024-06-01T12:00:00.000Z')).toBe(
        Math.floor(Date.parse('2024-06-01T12:00:00.000Z') / 1000),
      );
    });

    it('12. returns null for empty or invalid input', () => {
      expect(parseTimeToUnix('')).toBeNull();
      expect(parseTimeToUnix('   ')).toBeNull();
      expect(parseTimeToUnix('nope')).toBeNull();
    });
  });
});

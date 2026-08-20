import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { LivekitService } from '../../livekit/livekit.service';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import {
  SipTrunk,
  SipTrunkDirection,
} from '../../sip-trunks/sip-trunk.entity';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { CreateSipDispatchRuleDto } from '../dto/create-sip-dispatch-rule.dto';
import { UpdateSipDispatchRuleDto } from '../dto/update-sip-dispatch-rule.dto';
import {
  SipDispatchRule,
  SipDispatchRuleType,
} from '../sip-dispatch-rule.entity';
import { SipDispatchRulesRepository } from '../sip-dispatch-rules.repository';
import { SipDispatchRulesService } from '../sip-dispatch-rules.service';

describe('SipDispatchRulesService', () => {
  let service: SipDispatchRulesService;
  let repo: {
    findByOrganization: jest.Mock;
    findByIdAndOrg: jest.Mock;
    findDraftsByOrganization: jest.Mock;
    findByIdsAndOrg: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let organizationsService: { findById: jest.Mock };
  let sipTrunksService: { getEntitiesByIds: jest.Mock };
  let organizationAgentsService: { getEntityWithTemplate: jest.Mock };
  let toolProfilesService: { resolveEnabledToolIds: jest.Mock };
  let livekit: {
    getAgentName: jest.Mock;
    createSipDispatchRule: jest.Mock;
    deleteSipDispatchRule: jest.Mock;
  };

  const ORG_ID = 'org-id';
  const RULE_ID = 'rule-id';
  const TRUNK_ID = 'inbound-trunk-id';
  const ORG_AGENT_ID = 'org-agent-id';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Organization;

  const inboundLiveTrunk: SipTrunk = {
    id: TRUNK_ID,
    organizationId: ORG_ID,
    name: 'Inbound live',
    direction: SipTrunkDirection.INBOUND,
    providerAddress: null,
    authUsername: null,
    authPassword: null,
    numbers: ['+15551234567'],
    allowedNumbers: [],
    allowedAddresses: [],
    krispEnabled: true,
    livekitTrunkId: 'ST_in_1',
    isActive: true,
    metadata: null,
    publishedAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as SipTrunk;

  const inboundDraftTrunk: SipTrunk = {
    ...inboundLiveTrunk,
    id: 'inbound-draft-trunk',
    livekitTrunkId: null,
    publishedAt: null,
  } as SipTrunk;

  const outboundTrunk: SipTrunk = {
    ...inboundLiveTrunk,
    id: 'outbound-trunk-id',
    direction: SipTrunkDirection.OUTBOUND,
    livekitTrunkId: 'ST_out_1',
  } as SipTrunk;

  const draftRule: SipDispatchRule = {
    id: RULE_ID,
    organizationId: ORG_ID,
    name: 'Inbound routing',
    ruleType: SipDispatchRuleType.INDIVIDUAL,
    roomPrefix: 'call-',
    roomName: null,
    pin: null,
    randomize: false,
    sipTrunkIds: [TRUNK_ID],
    hidePhoneNumber: false,
    attributes: null,
    metadata: null,
    organizationAgentId: null,
    agentName: null,
    livekitDispatchRuleId: null,
    isActive: true,
    publishedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as SipDispatchRule;

  const liveRule: SipDispatchRule = {
    ...draftRule,
    id: 'live-rule-id',
    livekitDispatchRuleId: 'SDR_live',
    publishedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as SipDispatchRule;

  const orgAgentWithTemplate = {
    id: ORG_AGENT_ID,
    organizationId: ORG_ID,
    systemPrompt: 'You are a helpful clinic agent.',
    onEnterInstructions: 'Greet warmly',
    onExitInstructions: null,
    defaultTaskKey: 'confirm_appointment',
    toolProfileId: 'profile-1',
    voice: 'alloy',
    model: null,
    temperature: 0.4,
    speakingRate: null,
    deliveryMode: null,
    agent: {
      id: 'template-id',
      key: 'inbound',
      defaultTaskKey: 'general',
      voice: null,
      model: 'template-model',
      temperature: 0.2,
      speakingRate: 0.9,
      deliveryMode: 'CREATIVE',
    },
  };

  beforeEach(async () => {
    repo = {
      findByOrganization: jest.fn(),
      findByIdAndOrg: jest.fn(),
      findDraftsByOrganization: jest.fn(),
      findByIdsAndOrg: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as SipDispatchRule),
      save: jest.fn(async (row: SipDispatchRule) => ({
        id: row.id ?? RULE_ID,
        ...row,
        createdAt: row.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
      remove: jest.fn(async (row: SipDispatchRule) => row),
    };

    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };

    sipTrunksService = {
      getEntitiesByIds: jest.fn().mockResolvedValue([]),
    };

    organizationAgentsService = {
      getEntityWithTemplate: jest.fn().mockResolvedValue(orgAgentWithTemplate),
    };

    toolProfilesService = {
      resolveEnabledToolIds: jest
        .fn()
        .mockResolvedValue(['endCall', 'confirmAppointment']),
    };

    livekit = {
      getAgentName: jest.fn().mockReturnValue('call-agent'),
      createSipDispatchRule: jest.fn(),
      deleteSipDispatchRule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SipDispatchRulesService,
        { provide: SipDispatchRulesRepository, useValue: repo },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: SipTrunksService, useValue: sipTrunksService },
        {
          provide: OrganizationAgentsService,
          useValue: organizationAgentsService,
        },
        { provide: ToolProfilesService, useValue: toolProfilesService },
        { provide: LivekitService, useValue: livekit },
      ],
    }).compile();

    service = module.get(SipDispatchRulesService);
  });

  describe('list / get', () => {
    it('1. listByOrganization gates on org and maps draft status', async () => {
      repo.findByOrganization.mockResolvedValue([draftRule]);

      const result = await service.listByOrganization(ORG_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('draft');
      expect(result[0].id).toBe(RULE_ID);
    });

    it('2. getOne throws NotFound when rule not in org', async () => {
      repo.findByIdAndOrg.mockResolvedValue(null);

      await expect(service.getOne(ORG_ID, RULE_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOne(ORG_ID, RULE_ID)).rejects.toThrow(
        `Dispatch rule not found: ${RULE_ID} (org ${ORG_ID})`,
      );
    });

    it('3. missing org propagates NotFound and skips repo', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(service.listByOrganization(ORG_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.findByOrganization).not.toHaveBeenCalled();
    });
  });

  describe('createDraft', () => {
    it('4. individual default: roomPrefix call-, draft livekit id null', async () => {
      const dto: CreateSipDispatchRuleDto = {
        name: '  Inbound routing  ',
      };

      const result = await service.createDraft(ORG_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          name: 'Inbound routing',
          ruleType: SipDispatchRuleType.INDIVIDUAL,
          roomPrefix: 'call-',
          livekitDispatchRuleId: null,
          publishedAt: null,
          sipTrunkIds: [],
          isActive: true,
        }),
      );
      expect(result.status).toBe('draft');
      expect(result.livekitDispatchRuleId).toBeNull();
      expect(sipTrunksService.getEntitiesByIds).not.toHaveBeenCalled();
    });

    it('5. direct without roomName → BadRequest', async () => {
      const dto: CreateSipDispatchRuleDto = {
        name: 'Direct rule',
        ruleType: SipDispatchRuleType.DIRECT,
      };

      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        'roomName is required for direct dispatch rules',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('6. unknown trunk id → BadRequest', async () => {
      sipTrunksService.getEntitiesByIds.mockResolvedValue([]);
      const dto: CreateSipDispatchRuleDto = {
        name: 'Rule',
        sipTrunkIds: [TRUNK_ID],
      };

      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        `SIP trunk not found in organization: ${TRUNK_ID}`,
      );
    });

    it('7. outbound trunk id → BadRequest (inbound only)', async () => {
      sipTrunksService.getEntitiesByIds.mockResolvedValue([outboundTrunk]);
      const dto: CreateSipDispatchRuleDto = {
        name: 'Rule',
        sipTrunkIds: [outboundTrunk.id],
      };

      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createDraft(ORG_ID, dto)).rejects.toThrow(
        /may only reference inbound trunks/,
      );
    });

    it('8. empty sipTrunkIds allowed without trunk lookup', async () => {
      const dto: CreateSipDispatchRuleDto = {
        name: 'Rule',
        sipTrunkIds: [],
      };

      await service.createDraft(ORG_ID, dto);

      expect(sipTrunksService.getEntitiesByIds).not.toHaveBeenCalled();
    });

    it('9. organizationAgentId is validated via agents service', async () => {
      const dto: CreateSipDispatchRuleDto = {
        name: 'Rule',
        organizationAgentId: ORG_AGENT_ID,
      };

      await service.createDraft(ORG_ID, dto);

      expect(
        organizationAgentsService.getEntityWithTemplate,
      ).toHaveBeenCalledWith(ORG_ID, ORG_AGENT_ID);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationAgentId: ORG_AGENT_ID }),
      );
    });

    it('9b. direct with roomName succeeds', async () => {
      const dto: CreateSipDispatchRuleDto = {
        name: 'Direct',
        ruleType: SipDispatchRuleType.DIRECT,
        roomName: '  open-room  ',
      };

      const result = await service.createDraft(ORG_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleType: SipDispatchRuleType.DIRECT,
          roomName: 'open-room',
          roomPrefix: null,
        }),
      );
      expect(result.ruleType).toBe(SipDispatchRuleType.DIRECT);
    });
  });

  describe('update', () => {
    it('10. re-validates direct roomName required', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        ruleType: SipDispatchRuleType.INDIVIDUAL,
      });
      const dto: UpdateSipDispatchRuleDto = {
        ruleType: SipDispatchRuleType.DIRECT,
        roomName: null,
      };

      await expect(service.update(ORG_ID, RULE_ID, dto)).rejects.toThrow(
        'roomName is required for direct dispatch rules',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('11. individual empty roomPrefix defaults to call-', async () => {
      repo.findByIdAndOrg.mockResolvedValue({ ...draftRule });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);
      const dto: UpdateSipDispatchRuleDto = {
        roomPrefix: '   ',
      };

      const result = await service.update(ORG_ID, RULE_ID, dto);

      expect(result.roomPrefix).toBe('call-');
    });

    it('12. updating sipTrunkIds re-asserts inbound trunks', async () => {
      repo.findByIdAndOrg.mockResolvedValue({ ...draftRule });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([outboundTrunk]);
      const dto: UpdateSipDispatchRuleDto = {
        sipTrunkIds: [outboundTrunk.id],
      };

      await expect(service.update(ORG_ID, RULE_ID, dto)).rejects.toThrow(
        /may only reference inbound trunks/,
      );
    });

    it('13. updates are local only (no LiveKit)', async () => {
      repo.findByIdAndOrg.mockResolvedValue({ ...draftRule });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      const dto: UpdateSipDispatchRuleDto = {
        name: '  Renamed  ',
        sipTrunkIds: [TRUNK_ID],
      };

      await service.update(ORG_ID, RULE_ID, dto);

      expect(livekit.createSipDispatchRule).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Renamed',
          sipTrunkIds: [TRUNK_ID],
        }),
      );
    });
  });

  describe('remove', () => {
    it('14. local only — never calls LiveKit delete', async () => {
      repo.findByIdAndOrg.mockResolvedValue(liveRule);

      await service.remove(ORG_ID, liveRule.id);

      expect(livekit.deleteSipDispatchRule).not.toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalledWith(liveRule);
    });
  });

  describe('publish', () => {
    it('15. inactive → BadRequest', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        isActive: false,
      });

      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        /inactive/,
      );
      expect(livekit.createSipDispatchRule).not.toHaveBeenCalled();
    });

    it('16. already published → ConflictException', async () => {
      repo.findByIdAndOrg.mockResolvedValue(liveRule);

      await expect(service.publish(ORG_ID, liveRule.id)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.publish(ORG_ID, liveRule.id)).rejects.toThrow(
        /already published/,
      );
    });

    it('17. trunk not published → BadRequest Publish trunks first', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        sipTrunkIds: [inboundDraftTrunk.id],
      });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundDraftTrunk]);

      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        /Publish trunks first/,
      );
    });

    it('18a. missing trunk → BadRequest', async () => {
      repo.findByIdAndOrg.mockResolvedValue(draftRule);
      sipTrunksService.getEntitiesByIds.mockResolvedValue([]);

      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        /unknown SIP trunk/,
      );
    });

    it('18b. outbound trunk → BadRequest', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        sipTrunkIds: [outboundTrunk.id],
      });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([outboundTrunk]);

      await expect(service.publish(ORG_ID, RULE_ID)).rejects.toThrow(
        /must be inbound/,
      );
    });

    it('19. no org agent: metadata JSON has fallbacks', async () => {
      repo.findByIdAndOrg.mockResolvedValue({ ...draftRule });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_new',
      });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);

      await service.publish(ORG_ID, RULE_ID);

      const call = livekit.createSipDispatchRule.mock.calls[0][0];
      expect(call.agentName).toBe('call-agent');
      expect(livekit.getAgentName).toHaveBeenCalled();
      const meta = JSON.parse(call.agentMetadata);
      expect(meta).toMatchObject({
        organizationId: ORG_ID,
        direction: 'inbound',
        medium: 'sip',
        agentKey: 'inbound',
        task: 'general',
        prompt: { systemPrompt: '' },
        enabledTools: ['endCall'],
      });
    });

    it('20. with org agent: packs persona, hooks, task, tools', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        organizationAgentId: ORG_AGENT_ID,
        agentName: 'custom-agent',
      });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_agent',
      });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);

      await service.publish(ORG_ID, RULE_ID);

      expect(
        organizationAgentsService.getEntityWithTemplate,
      ).toHaveBeenCalledWith(ORG_ID, ORG_AGENT_ID);
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenCalledWith(
        'profile-1',
      );

      const call = livekit.createSipDispatchRule.mock.calls[0][0];
      expect(call.agentName).toBe('custom-agent');
      const meta = JSON.parse(call.agentMetadata);
      expect(meta).toMatchObject({
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        agentKey: 'inbound',
        direction: 'inbound',
        medium: 'sip',
        task: 'confirm_appointment',
        prompt: {
          systemPrompt: 'You are a helpful clinic agent.',
          onEnterInstructions: 'Greet warmly',
          onExitInstructions: null,
        },
        enabledTools: ['endCall', 'confirmAppointment'],
        voice: 'alloy',
        temperature: 0.4,
        model: 'template-model',
        speakingRate: 0.9,
        deliveryMode: 'CREATIVE',
      });
    });

    it('21. agentName falls back to livekit.getAgentName()', async () => {
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        agentName: null,
      });
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.getAgentName.mockReturnValue('platform-agent');
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_fb',
      });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);

      await service.publish(ORG_ID, RULE_ID);

      expect(livekit.createSipDispatchRule.mock.calls[0][0].agentName).toBe(
        'platform-agent',
      );
    });

    it('22. rule type mapping: individual / direct / callee', async () => {
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_map',
      });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);

      // individual
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        ruleType: SipDispatchRuleType.INDIVIDUAL,
        roomPrefix: 'room-',
        pin: '9',
      });
      await service.publish(ORG_ID, RULE_ID);
      expect(livekit.createSipDispatchRule.mock.calls.at(-1)[0].rule).toEqual({
        type: 'individual',
        roomPrefix: 'room-',
        pin: '9',
      });

      // direct
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        ruleType: SipDispatchRuleType.DIRECT,
        roomName: 'fixed-room',
        pin: null,
      });
      await service.publish(ORG_ID, RULE_ID);
      expect(livekit.createSipDispatchRule.mock.calls.at(-1)[0].rule).toEqual({
        type: 'direct',
        roomName: 'fixed-room',
        pin: undefined,
      });

      // callee
      repo.findByIdAndOrg.mockResolvedValue({
        ...draftRule,
        ruleType: SipDispatchRuleType.CALLEE,
        roomPrefix: 'c-',
        randomize: true,
        pin: '1',
      });
      await service.publish(ORG_ID, RULE_ID);
      expect(livekit.createSipDispatchRule.mock.calls.at(-1)[0].rule).toEqual({
        type: 'callee',
        roomPrefix: 'c-',
        pin: '1',
        randomize: true,
      });
    });

    it('23. happy path sets livekitDispatchRuleId + publishedAt', async () => {
      const row = { ...draftRule };
      repo.findByIdAndOrg.mockResolvedValue(row);
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_happy',
      });
      repo.save.mockImplementation(async (r: SipDispatchRule) => r);

      const result = await service.publish(ORG_ID, RULE_ID);

      expect(livekit.createSipDispatchRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: row.name,
          trunkIds: ['ST_in_1'],
          hidePhoneNumber: false,
        }),
      );
      expect(result.livekitDispatchRuleId).toBe('SDR_happy');
      expect(result.status).toBe('live');
      expect(result.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('publishMany', () => {
    it('24. not-found selected id → failed', async () => {
      repo.findByIdsAndOrg.mockResolvedValue([]);

      const { results, published } = await service.publishMany(ORG_ID, [
        'missing-rule',
      ]);

      expect(results).toEqual([
        {
          id: 'missing-rule',
          outcome: 'failed',
          message: 'Dispatch rule not found for org: missing-rule',
        },
      ]);
      expect(published).toEqual([]);
    });

    it('25. already live → skipped', async () => {
      repo.findByIdsAndOrg.mockResolvedValue([liveRule]);

      const { results, published } = await service.publishMany(ORG_ID, [
        liveRule.id,
      ]);

      expect(results[0]).toMatchObject({
        id: liveRule.id,
        outcome: 'skipped',
        message: 'Already published',
        livekitId: 'SDR_live',
      });
      expect(published).toEqual([]);
      expect(livekit.createSipDispatchRule).not.toHaveBeenCalled();
    });

    it('26. publish error → failed with message', async () => {
      const inactive = { ...draftRule, isActive: false };
      repo.findByIdsAndOrg.mockResolvedValue([inactive]);
      repo.findByIdAndOrg.mockResolvedValue(inactive);

      const { results, published } = await service.publishMany(ORG_ID, [
        RULE_ID,
      ]);

      expect(results[0].outcome).toBe('failed');
      expect(results[0].message).toMatch(/inactive/);
      expect(published).toEqual([]);
    });

    it('27. success → published list + results', async () => {
      const draft = { ...draftRule };
      repo.findByIdsAndOrg.mockResolvedValue([draft]);
      repo.findByIdAndOrg.mockResolvedValue(draft);
      sipTrunksService.getEntitiesByIds.mockResolvedValue([inboundLiveTrunk]);
      livekit.createSipDispatchRule.mockResolvedValue({
        sipDispatchRuleId: 'SDR_many',
      });
      repo.save.mockImplementation(async (row: SipDispatchRule) => row);

      const { results, published } = await service.publishMany(ORG_ID, [
        RULE_ID,
      ]);

      expect(results[0]).toMatchObject({
        id: RULE_ID,
        outcome: 'published',
        livekitId: 'SDR_many',
      });
      expect(published).toHaveLength(1);
      expect(published[0].livekitDispatchRuleId).toBe('SDR_many');
    });

    it('27b. without ids uses findDraftsByOrganization', async () => {
      repo.findDraftsByOrganization.mockResolvedValue([]);

      const { results, published } = await service.publishMany(ORG_ID);

      expect(repo.findDraftsByOrganization).toHaveBeenCalledWith(ORG_ID);
      expect(results).toEqual([]);
      expect(published).toEqual([]);
    });
  });
});

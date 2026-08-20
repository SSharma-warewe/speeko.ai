import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrganizationIntegration } from '../../organization-integrations/organization-integration.entity';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { Agent, AgentDirection } from '../agent.entity';
import { AgentsService } from '../agents.service';
import { AssignAgentDto } from '../dto/assign-agent.dto';
import { CloneOrganizationAgentDto } from '../dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from '../dto/update-organization-agent.dto';
import { OrganizationAgent } from '../organization-agent.entity';
import { OrganizationAgentsRepository } from '../organization-agents.repository';
import { OrganizationAgentsService } from '../organization-agents.service';

describe('OrganizationAgentsService', () => {
  let service: OrganizationAgentsService;
  let repository: {
    findByIdAndOrgWithAgent: jest.Mock;
    findByOrganizationWithAgent: jest.Mock;
    findByOrgAndSlug: jest.Mock;
    listSlugsByOrganization: jest.Mock;
    listSlugsByOrganizationExcluding: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let agentsService: { findById: jest.Mock };
  let organizationsService: { findById: jest.Mock };
  let toolProfilesService: {
    findById: jest.Mock;
    resolveEnabledToolIds: jest.Mock;
  };
  let organizationIntegrationRepo: { findOne: jest.Mock };

  const ORG_ID = 'org-id';
  const OTHER_ORG_ID = 'other-org-id';
  const TEMPLATE_ID = 'template-id';
  const ORG_AGENT_ID = 'org-agent-id';
  const PROFILE_ID = 'profile-id';
  const CAL_ID = 'calendar-integration-id';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Organization;

  const template: Agent = {
    id: TEMPLATE_ID,
    key: 'inbound',
    name: 'Inbound template',
    direction: AgentDirection.INBOUND,
    description: 'Platform inbound',
    systemPrompt: 'Template persona',
    onEnterInstructions: 'Template enter',
    onExitInstructions: null,
    defaultTaskKey: 'general',
    defaultToolProfileId: PROFILE_ID,
    voice: 'template-voice',
    model: 'template-model',
    temperature: 0.5,
    speakingRate: 1.15,
    deliveryMode: 'STABLE',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Agent;

  function makeOrgAgent(
    overrides: Partial<OrganizationAgent> = {},
  ): OrganizationAgent {
    return {
      id: ORG_AGENT_ID,
      organizationId: ORG_ID,
      agentId: TEMPLATE_ID,
      name: 'Booking confirmations',
      slug: 'booking-confirmations',
      systemPrompt: 'Org persona customized',
      onEnterInstructions: '',
      onExitInstructions: 'Custom bye',
      toolProfileId: 'org-profile',
      calendarIntegrationId: CAL_ID,
      defaultTaskKey: 'confirm_appointment',
      voice: 'org-voice',
      model: 'org-model',
      temperature: 0.2,
      speakingRate: 0.9,
      deliveryMode: 'CREATIVE',
      isActive: true,
      createdAt: new Date('2024-01-03T00:00:00.000Z'),
      updatedAt: new Date('2024-01-04T00:00:00.000Z'),
      agent: template,
      ...overrides,
    } as OrganizationAgent;
  }

  beforeEach(async () => {
    repository = {
      findByIdAndOrgWithAgent: jest.fn(),
      findByOrganizationWithAgent: jest.fn(),
      findByOrgAndSlug: jest.fn(),
      listSlugsByOrganization: jest.fn().mockResolvedValue([]),
      listSlugsByOrganizationExcluding: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data }) as OrganizationAgent),
      save: jest.fn(async (row: OrganizationAgent) => ({
        id: row.id ?? ORG_AGENT_ID,
        ...row,
        createdAt: row.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
      remove: jest.fn(async (row: OrganizationAgent) => row),
    };

    agentsService = {
      findById: jest.fn().mockResolvedValue(template),
    };

    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };

    toolProfilesService = {
      findById: jest.fn().mockResolvedValue({ id: PROFILE_ID }),
      resolveEnabledToolIds: jest.fn().mockResolvedValue(['endCall']),
    };

    organizationIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: CAL_ID,
        organizationId: ORG_ID,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationAgentsService,
        {
          provide: OrganizationAgentsRepository,
          useValue: repository,
        },
        { provide: AgentsService, useValue: agentsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: ToolProfilesService, useValue: toolProfilesService },
        {
          provide: getRepositoryToken(OrganizationIntegration),
          useValue: organizationIntegrationRepo,
        },
      ],
    }).compile();

    service = module.get(OrganizationAgentsService);
  });

  describe('org gate + isolation', () => {
    it('1. listByOrganization gates on organizationsService.findById', async () => {
      repository.findByOrganizationWithAgent.mockResolvedValue([]);

      await service.listByOrganization(ORG_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
    });

    it('2. missing org short-circuits before agent repo', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(service.listByOrganization(ORG_ID)).rejects.toThrow(
        `Organization not found: ${ORG_ID}`,
      );
      expect(repository.findByOrganizationWithAgent).not.toHaveBeenCalled();
    });

    it('3. wrong-org agent id surfaces as NotFound for get/update/remove/clone', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(null);
      const msg = `Organization agent not found: ${ORG_AGENT_ID} (org ${OTHER_ORG_ID})`;

      organizationsService.findById.mockResolvedValue({
        ...org,
        id: OTHER_ORG_ID,
      });

      await expect(
        service.getOne(OTHER_ORG_ID, ORG_AGENT_ID),
      ).rejects.toThrow(msg);
      await expect(
        service.update(OTHER_ORG_ID, ORG_AGENT_ID, {
          name: 'x',
        } as UpdateOrganizationAgentDto),
      ).rejects.toThrow(msg);
      await expect(
        service.remove(OTHER_ORG_ID, ORG_AGENT_ID),
      ).rejects.toThrow(msg);
      await expect(
        service.clone(OTHER_ORG_ID, ORG_AGENT_ID, {
          name: 'Clone',
        } as CloneOrganizationAgentDto),
      ).rejects.toThrow(msg);

      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('4. inactive template → Conflict with template key; no save', async () => {
      agentsService.findById.mockResolvedValue({
        ...template,
        isActive: false,
      });

      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
        } as AssignAgentDto),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
        } as AssignAgentDto),
      ).rejects.toThrow('Agent template is inactive: inbound');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('5. whitespace-only name falls back to template.name; long name sliced to 255', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({ name: template.name }),
      );

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: '   ',
      } as AssignAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: template.name }),
      );

      repository.create.mockClear();
      const long = 'N'.repeat(300);
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({ name: long.slice(0, 255) }),
      );

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: long,
      } as AssignAgentDto);

      expect(repository.create.mock.calls[0][0].name).toHaveLength(255);
    });

    it('6. no slug: auto-allocate with -2 when base taken', async () => {
      repository.listSlugsByOrganization.mockResolvedValue(['inbound']);
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({ slug: 'inbound-2', name: 'Inbound template' }),
      );

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
      } as AssignAgentDto);

      expect(repository.listSlugsByOrganization).toHaveBeenCalledWith(ORG_ID);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'inbound-2' }),
      );
      expect(repository.findByOrgAndSlug).not.toHaveBeenCalled();
    });

    it('7. explicit free slug uses slugify; does not call listSlugs', async () => {
      repository.findByOrgAndSlug.mockResolvedValue(null);
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({ slug: 'booking-confirmations' }),
      );

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        slug: '  Booking Confirmations  ',
      } as AssignAgentDto);

      expect(repository.listSlugsByOrganization).not.toHaveBeenCalled();
      expect(repository.findByOrgAndSlug).toHaveBeenCalledWith(
        ORG_ID,
        'booking-confirmations',
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'booking-confirmations' }),
      );
    });

    it('8. explicit slug taken → Conflict; no save', async () => {
      repository.findByOrgAndSlug.mockResolvedValue(
        makeOrgAgent({ id: 'other-id', slug: 'taken' }),
      );

      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
          slug: 'taken',
        } as AssignAgentDto),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
          slug: 'taken',
        } as AssignAgentDto),
      ).rejects.toThrow('Organization agent slug already in use: taken');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('9. two assigns with same agentId both succeed (no uniqueness on template)', async () => {
      repository.listSlugsByOrganization
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['inbound']);
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(makeOrgAgent({ id: 'a1', slug: 'inbound' }))
        .mockResolvedValueOnce(makeOrgAgent({ id: 'a2', slug: 'inbound-2' }));

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: 'First',
      } as AssignAgentDto);
      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: 'Second',
      } as AssignAgentDto);

      expect(repository.save).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ agentId: TEMPLATE_ID }),
      );
      expect(repository.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ agentId: TEMPLATE_ID }),
      );
    });

    it('10. copies template persona/hooks/voice; always isActive true', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: 'Copy check',
      } as AssignAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          agentId: TEMPLATE_ID,
          systemPrompt: 'Template persona',
          onEnterInstructions: 'Template enter',
          onExitInstructions: null,
          voice: 'template-voice',
          model: 'template-model',
          temperature: 0.5,
          speakingRate: 1.15,
          deliveryMode: 'STABLE',
          isActive: true,
          toolProfileId: PROFILE_ID,
          calendarIntegrationId: null,
          defaultTaskKey: 'general',
        }),
      );
    });

    it('11. toolProfileId override vs invalid profile', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        toolProfileId: 'custom-profile',
      } as AssignAgentDto);

      expect(toolProfilesService.findById).toHaveBeenCalledWith(
        'custom-profile',
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ toolProfileId: 'custom-profile' }),
      );

      toolProfilesService.findById.mockRejectedValueOnce(
        new NotFoundException('Tool profile not found: bad'),
      );
      repository.create.mockClear();
      repository.save.mockClear();

      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
          toolProfileId: 'bad',
        } as AssignAgentDto),
      ).rejects.toThrow('Tool profile not found: bad');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('12. inbound defaultTaskKey dto override vs template vs general; outbound null', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        defaultTaskKey: 'survey',
      } as AssignAgentDto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTaskKey: 'survey' }),
      );

      repository.create.mockClear();
      agentsService.findById.mockResolvedValue({
        ...template,
        defaultTaskKey: null as unknown as string,
      });
      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
      } as AssignAgentDto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTaskKey: 'general' }),
      );

      const outboundTemplate = {
        ...template,
        key: 'outbound',
        direction: AgentDirection.OUTBOUND,
        defaultTaskKey: 'general',
      };
      agentsService.findById.mockResolvedValue(outboundTemplate);
      repository.create.mockClear();
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({
          defaultTaskKey: null,
          agent: outboundTemplate,
        }),
      );
      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
      } as AssignAgentDto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTaskKey: null }),
      );

      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
          defaultTaskKey: 'survey',
        } as AssignAgentDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('13. calendar integration must be same-org; asserts findOne where clause', async () => {
      organizationIntegrationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assign(ORG_ID, {
          agentId: TEMPLATE_ID,
          calendarIntegrationId: CAL_ID,
        } as AssignAgentDto),
      ).rejects.toThrow(`Calendar integration not found: ${CAL_ID}`);
      expect(organizationIntegrationRepo.findOne).toHaveBeenCalledWith({
        where: { id: CAL_ID, organizationId: ORG_ID },
      });
      expect(repository.save).not.toHaveBeenCalled();

      organizationIntegrationRepo.findOne.mockResolvedValue({
        id: CAL_ID,
        organizationId: ORG_ID,
      });
      repository.findByIdAndOrgWithAgent.mockResolvedValue(
        makeOrgAgent({ calendarIntegrationId: CAL_ID }),
      );

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        calendarIntegrationId: CAL_ID,
      } as AssignAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ calendarIntegrationId: CAL_ID }),
      );
    });

    it('14. no calendar in dto → calendarIntegrationId null; no findOne', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());

      await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
      } as AssignAgentDto);

      expect(organizationIntegrationRepo.findOne).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ calendarIntegrationId: null }),
      );
    });

    it('15. response includes enabledTools and template direction', async () => {
      const saved = makeOrgAgent();
      repository.findByIdAndOrgWithAgent.mockResolvedValue(saved);
      toolProfilesService.resolveEnabledToolIds.mockResolvedValue([
        'endCall',
        'booking',
      ]);

      const result = await service.assign(ORG_ID, {
        agentId: TEMPLATE_ID,
        name: 'Resp',
      } as AssignAgentDto);

      expect(result.enabledTools).toEqual(['endCall', 'booking']);
      expect(result.direction).toBe(AgentDirection.INBOUND);
      expect(result.templateKey).toBe('inbound');
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenCalledWith(
        saved.toolProfileId,
      );
    });
  });

  describe('clone', () => {
    it('16. copies source persona fields — not template defaults', async () => {
      const source = makeOrgAgent({
        systemPrompt: 'SOURCE ONLY PROMPT',
        onEnterInstructions: '',
        onExitInstructions: null,
        toolProfileId: 'source-profile',
        calendarIntegrationId: 'source-cal',
        defaultTaskKey: 'debt_collection',
        voice: 'source-voice',
        model: 'source-model',
        temperature: 0.9,
        speakingRate: 1.4,
        deliveryMode: 'BALANCED',
      });
      // template differs — clone must ignore these for persona
      expect(source.systemPrompt).not.toBe(template.systemPrompt);

      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(
          makeOrgAgent({
            id: 'clone-id',
            name: 'Cloned',
            slug: 'cloned',
            systemPrompt: source.systemPrompt,
          }),
        );
      repository.listSlugsByOrganization.mockResolvedValue([
        'booking-confirmations',
      ]);

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: 'Cloned',
      } as CloneOrganizationAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          agentId: TEMPLATE_ID,
          name: 'Cloned',
          systemPrompt: 'SOURCE ONLY PROMPT',
          onEnterInstructions: '',
          onExitInstructions: null,
          toolProfileId: 'source-profile',
          calendarIntegrationId: 'source-cal',
          defaultTaskKey: 'debt_collection',
          voice: 'source-voice',
          model: 'source-model',
          temperature: 0.9,
          speakingRate: 1.4,
          deliveryMode: 'BALANCED',
          isActive: true,
        }),
      );
    });

    it('16b. outbound clone stores null defaultTaskKey even if source had leftover', async () => {
      const outboundTemplate = {
        ...template,
        key: 'outbound',
        direction: AgentDirection.OUTBOUND,
      };
      const source = makeOrgAgent({
        defaultTaskKey: 'demo_booking',
        agent: outboundTemplate,
      });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(
          makeOrgAgent({
            id: 'clone-out',
            defaultTaskKey: null,
            agent: outboundTemplate,
          }),
        );
      repository.listSlugsByOrganization.mockResolvedValue([]);

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: 'Outbound copy',
      } as CloneOrganizationAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTaskKey: null }),
      );
    });

    it('17. preserves isActive false from inactive source', async () => {
      const source = makeOrgAgent({ isActive: false });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(makeOrgAgent({ id: 'c2', isActive: false }));
      repository.listSlugsByOrganization.mockResolvedValue([]);

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: 'Inactive clone',
      } as CloneOrganizationAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('18. keeps same agentId lineage as source', async () => {
      const source = makeOrgAgent({ agentId: TEMPLATE_ID });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(makeOrgAgent({ id: 'c3' }));
      repository.listSlugsByOrganization.mockResolvedValue([]);

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: 'Lineage',
      } as CloneOrganizationAgentDto);

      expect(repository.create.mock.calls[0][0].agentId).toBe(TEMPLATE_ID);
    });

    it('19. explicit slug conflict → Conflict; no save', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      repository.findByOrgAndSlug.mockResolvedValue(
        makeOrgAgent({ id: 'other', slug: 'taken-slug' }),
      );

      await expect(
        service.clone(ORG_ID, ORG_AGENT_ID, {
          name: 'X',
          slug: 'taken-slug',
        } as CloneOrganizationAgentDto),
      ).rejects.toThrow('Organization agent slug already in use: taken-slug');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('20. auto slug when preferred taken → -2', async () => {
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(makeOrgAgent())
        .mockResolvedValueOnce(makeOrgAgent({ id: 'c4', slug: 'cloned-2' }));
      repository.listSlugsByOrganization.mockResolvedValue(['cloned']);

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: 'Cloned',
      } as CloneOrganizationAgentDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'cloned-2' }),
      );
    });

    it('21. name is trimmed and sliced to 255', async () => {
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(makeOrgAgent())
        .mockResolvedValueOnce(makeOrgAgent({ id: 'c5' }));
      repository.listSlugsByOrganization.mockResolvedValue([]);
      const long = `  ${'Z'.repeat(300)}  `;

      await service.clone(ORG_ID, ORG_AGENT_ID, {
        name: long,
      } as CloneOrganizationAgentDto);

      const createdName = repository.create.mock.calls[0][0].name as string;
      expect(createdName).toHaveLength(255);
      expect(createdName.startsWith('Z')).toBe(true);
    });
  });

  describe('update', () => {
    it('22. slug change to free value; same-id keep allowed', async () => {
      const row = makeOrgAgent();
      // update() loads twice per call (mutate + reload)
      repository.findByIdAndOrgWithAgent.mockResolvedValue(row);
      repository.findByOrgAndSlug.mockResolvedValue(null);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        slug: '  New Slug  ',
      } as UpdateOrganizationAgentDto);

      expect(repository.findByOrgAndSlug).toHaveBeenCalledWith(
        ORG_ID,
        'new-slug',
      );
      expect(row.slug).toBe('new-slug');

      // same slug as self — existing id matches excludeId → no Conflict
      repository.findByOrgAndSlug.mockResolvedValue(
        makeOrgAgent({ id: ORG_AGENT_ID, slug: 'booking-confirmations' }),
      );
      await service.update(ORG_ID, ORG_AGENT_ID, {
        slug: 'booking-confirmations',
      } as UpdateOrganizationAgentDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('23. slug taken by other row → Conflict', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      repository.findByOrgAndSlug.mockResolvedValue(
        makeOrgAgent({ id: 'someone-else', slug: 'taken' }),
      );

      await expect(
        service.update(ORG_ID, ORG_AGENT_ID, {
          slug: 'taken',
        } as UpdateOrganizationAgentDto),
      ).rejects.toThrow('Organization agent slug already in use: taken');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('24. hook matrix: null / empty / whitespace', async () => {
      const row = makeOrgAgent();
      repository.findByIdAndOrgWithAgent.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        onEnterInstructions: null,
      } as UpdateOrganizationAgentDto);
      expect(row.onEnterInstructions).toBeNull();

      await service.update(ORG_ID, ORG_AGENT_ID, {
        onEnterInstructions: '',
      } as UpdateOrganizationAgentDto);
      expect(row.onEnterInstructions).toBe('');

      await service.update(ORG_ID, ORG_AGENT_ID, {
        onEnterInstructions: '   ',
      } as UpdateOrganizationAgentDto);
      expect(row.onEnterInstructions).toBeNull();
    });

    it('25. calendarIntegrationId null clears without findOne', async () => {
      const row = makeOrgAgent({ calendarIntegrationId: CAL_ID });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        calendarIntegrationId: null,
      } as UpdateOrganizationAgentDto);

      expect(organizationIntegrationRepo.findOne).not.toHaveBeenCalled();
      expect(row.calendarIntegrationId).toBeNull();
    });

    it('26. calendarIntegrationId set asserts same-org findOne', async () => {
      const row = makeOrgAgent({ calendarIntegrationId: null });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);
      organizationIntegrationRepo.findOne.mockResolvedValue({
        id: 'new-cal',
        organizationId: ORG_ID,
      });

      await service.update(ORG_ID, ORG_AGENT_ID, {
        calendarIntegrationId: 'new-cal',
      } as UpdateOrganizationAgentDto);

      expect(organizationIntegrationRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'new-cal', organizationId: ORG_ID },
      });
      expect(row.calendarIntegrationId).toBe('new-cal');
    });

    it('27. bad toolProfileId → NotFound; no save', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      toolProfilesService.findById.mockRejectedValue(
        new NotFoundException('Tool profile not found: bad'),
      );

      await expect(
        service.update(ORG_ID, ORG_AGENT_ID, {
          toolProfileId: 'bad',
        } as UpdateOrganizationAgentDto),
      ).rejects.toThrow('Tool profile not found: bad');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('27b. inbound rejects null/blank defaultTaskKey; outbound rejects any set and clears leftover', async () => {
      const inbound = makeOrgAgent({ defaultTaskKey: 'confirm_appointment' });
      repository.findByIdAndOrgWithAgent.mockResolvedValue(inbound);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await expect(
        service.update(ORG_ID, ORG_AGENT_ID, {
          defaultTaskKey: null,
        } as UpdateOrganizationAgentDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update(ORG_ID, ORG_AGENT_ID, {
          defaultTaskKey: '  ',
        } as UpdateOrganizationAgentDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        defaultTaskKey: 'survey',
      } as UpdateOrganizationAgentDto);
      expect(inbound.defaultTaskKey).toBe('survey');

      const outboundTemplate = {
        ...template,
        key: 'outbound',
        direction: AgentDirection.OUTBOUND,
      };
      const outbound = makeOrgAgent({
        defaultTaskKey: 'demo_booking',
        agent: outboundTemplate,
      });
      repository.findByIdAndOrgWithAgent.mockResolvedValue(outbound);

      await expect(
        service.update(ORG_ID, ORG_AGENT_ID, {
          defaultTaskKey: 'survey',
        } as UpdateOrganizationAgentDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        name: 'Still outbound',
      } as UpdateOrganizationAgentDto);
      expect(outbound.defaultTaskKey).toBeNull();
    });

    it('28. persona-only patch does not touch slug/toolProfile/agentId', async () => {
      const row = makeOrgAgent({
        slug: 'keep-slug',
        toolProfileId: 'keep-profile',
        agentId: TEMPLATE_ID,
        systemPrompt: 'old',
      });
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        systemPrompt: 'new persona only',
      } as UpdateOrganizationAgentDto);

      expect(row.systemPrompt).toBe('new persona only');
      expect(row.slug).toBe('keep-slug');
      expect(row.toolProfileId).toBe('keep-profile');
      expect(row.agentId).toBe(TEMPLATE_ID);
    });

    it('29. name trim + slice 255', async () => {
      const row = makeOrgAgent();
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        name: `  ${'A'.repeat(300)}  `,
      } as UpdateOrganizationAgentDto);

      expect(row.name).toHaveLength(255);
    });

    it('30. voice extras: empty voice → null; deliveryMode stored; speakingRate set', async () => {
      const row = makeOrgAgent();
      repository.findByIdAndOrgWithAgent
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(row);
      repository.save.mockImplementation(async (r: OrganizationAgent) => r);

      await service.update(ORG_ID, ORG_AGENT_ID, {
        voice: '  ',
        speakingRate: 0.75,
        deliveryMode: 'STABLE',
        temperature: 0.4,
      } as UpdateOrganizationAgentDto);

      expect(row.voice).toBeNull();
      expect(row.speakingRate).toBe(0.75);
      expect(row.deliveryMode).toBe('STABLE');
      expect(row.temperature).toBe(0.4);
    });
  });

  describe('remove', () => {
    const fkMessage =
      'Cannot delete organization agent while it is referenced by integration endpoints, dispatch rules, or other records. Re-point those first.';

    it('30. happy path removes loaded row', async () => {
      const row = makeOrgAgent();
      repository.findByIdAndOrgWithAgent.mockResolvedValue(row);

      await service.remove(ORG_ID, ORG_AGENT_ID);

      expect(repository.remove).toHaveBeenCalledWith(row);
    });

    it('31. Postgres code 23503 → Conflict with exact message', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      repository.remove.mockRejectedValue({
        code: '23503',
        message: 'insert or update on table violates foreign key constraint',
      });

      await expect(service.remove(ORG_ID, ORG_AGENT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.remove(ORG_ID, ORG_AGENT_ID)).rejects.toThrow(
        fkMessage,
      );
    });

    it('32. message matching violates foreign key → same Conflict', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      repository.remove.mockRejectedValue(
        new Error('update or delete on table violates foreign key constraint'),
      );

      await expect(service.remove(ORG_ID, ORG_AGENT_ID)).rejects.toThrow(
        fkMessage,
      );
    });

    it('33. unrelated Error rethrows as-is (not wrapped in Conflict)', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());
      const boom = new Error('disk full');
      repository.remove.mockRejectedValue(boom);

      await expect(service.remove(ORG_ID, ORG_AGENT_ID)).rejects.toBe(boom);
      await expect(service.remove(ORG_ID, ORG_AGENT_ID)).rejects.not.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('list / get wiring', () => {
    it('34. list maps all rows and resolves tools per row', async () => {
      const a = makeOrgAgent({ id: 'a', toolProfileId: 'p1' });
      const b = makeOrgAgent({ id: 'b', toolProfileId: 'p2' });
      repository.findByOrganizationWithAgent.mockResolvedValue([a, b]);
      toolProfilesService.resolveEnabledToolIds
        .mockResolvedValueOnce(['endCall'])
        .mockResolvedValueOnce(['endCall', 'booking']);

      const result = await service.listByOrganization(ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].enabledTools).toEqual(['endCall']);
      expect(result[1].enabledTools).toEqual(['endCall', 'booking']);
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenNthCalledWith(
        1,
        'p1',
      );
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenNthCalledWith(
        2,
        'p2',
      );
    });

    it('35. getOne returns calendarIntegrationId and templateKey', async () => {
      repository.findByIdAndOrgWithAgent.mockResolvedValue(makeOrgAgent());

      const result = await service.getOne(ORG_ID, ORG_AGENT_ID);

      expect(result.calendarIntegrationId).toBe(CAL_ID);
      expect(result.templateKey).toBe('inbound');
      expect(result.key).toBe('inbound');
      expect(result.organizationId).toBe(ORG_ID);
      expect(result.prompt.systemPrompt).toBe('Org persona customized');
    });

    it('35b. getEntityWithTemplate returns raw entity with agent relation', async () => {
      const row = makeOrgAgent();
      repository.findByIdAndOrgWithAgent.mockResolvedValue(row);

      const result = await service.getEntityWithTemplate(ORG_ID, ORG_AGENT_ID);

      expect(result).toBe(row);
      expect(result.agent.key).toBe('inbound');
      expect(result.systemPrompt).toBe('Org persona customized');
    });
  });
});

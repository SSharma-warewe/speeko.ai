import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { Agent, AgentDirection } from '../agent.entity';
import { AgentsRepository } from '../agents.repository';
import {
  AgentsService,
  CreateAgentSeedInput,
  normalizeHookInstructions,
} from '../agents.service';
import { UpdateAgentDto } from '../dto/update-agent.dto';

describe('normalizeHookInstructions', () => {
  it('1. null stays null (worker default)', () => {
    expect(normalizeHookInstructions(null)).toBeNull();
  });

  it('2. empty string stays empty string (silent) — must not become null', () => {
    expect(normalizeHookInstructions('')).toBe('');
  });

  it('3. whitespace-only becomes null (not silent)', () => {
    expect(normalizeHookInstructions('   ')).toBeNull();
    expect(normalizeHookInstructions('\t\n')).toBeNull();
  });

  it('4. trims non-empty custom instructions', () => {
    expect(normalizeHookInstructions('  hello  ')).toBe('hello');
  });

  it('5. preserves non-whitespace content without extra mutation', () => {
    expect(normalizeHookInstructions('keep me')).toBe('keep me');
  });
});

describe('AgentsService', () => {
  let service: AgentsService;
  let repository: {
    findByKey: jest.Mock;
    findById: jest.Mock;
    findAllOrderedByKey: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let toolProfilesService: {
    findById: jest.Mock;
    resolveEnabledToolIds: jest.Mock;
  };

  const TEMPLATE_ID = 'template-id';
  const PROFILE_ID = 'profile-id';

  const template: Agent = {
    id: TEMPLATE_ID,
    key: 'inbound',
    name: 'Inbound',
    direction: AgentDirection.INBOUND,
    description: 'Inbound template',
    systemPrompt: 'Be helpful',
    onEnterInstructions: null,
    onExitInstructions: null,
    defaultTaskKey: 'general',
    defaultToolProfileId: PROFILE_ID,
    voice: 'alloy',
    model: 'gpt-4o',
    temperature: 0.3,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Agent;

  beforeEach(async () => {
    repository = {
      findByKey: jest.fn(),
      findById: jest.fn(),
      findAllOrderedByKey: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as Agent),
      save: jest.fn(async (row: Agent) => ({
        id: row.id ?? TEMPLATE_ID,
        ...row,
        createdAt: row.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
    };

    toolProfilesService = {
      findById: jest.fn().mockResolvedValue({ id: PROFILE_ID }),
      resolveEnabledToolIds: jest.fn().mockResolvedValue(['endCall']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: AgentsRepository, useValue: repository },
        { provide: ToolProfilesService, useValue: toolProfilesService },
      ],
    }).compile();

    service = module.get(AgentsService);
  });

  describe('findById / list / get', () => {
    it('6. findById throws NotFound with exact message', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findById('missing')).rejects.toThrow(
        'Agent not found: missing',
      );
    });

    it('7. listTemplates resolves tools per row and preserves order', async () => {
      const outbound = {
        ...template,
        id: 'out-id',
        key: 'outbound',
        defaultToolProfileId: 'profile-out',
      } as Agent;
      repository.findAllOrderedByKey.mockResolvedValue([template, outbound]);
      toolProfilesService.resolveEnabledToolIds
        .mockResolvedValueOnce(['endCall'])
        .mockResolvedValueOnce(['endCall', 'booking']);

      const result = await service.listTemplates();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('inbound');
      expect(result[0].enabledTools).toEqual(['endCall']);
      expect(result[1].key).toBe('outbound');
      expect(result[1].enabledTools).toEqual(['endCall', 'booking']);
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenNthCalledWith(
        1,
        PROFILE_ID,
      );
      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenNthCalledWith(
        2,
        'profile-out',
      );
    });

    it('8. getTemplate maps + tools; missing agent 404', async () => {
      repository.findById.mockResolvedValue(template);
      toolProfilesService.resolveEnabledToolIds.mockResolvedValue([
        'endCall',
        'lookupCustomer',
      ]);

      const dto = await service.getTemplate(TEMPLATE_ID);

      expect(dto.id).toBe(TEMPLATE_ID);
      expect(dto.toolProfileId).toBe(PROFILE_ID);
      expect(dto.enabledTools).toEqual(['endCall', 'lookupCustomer']);
      expect(dto).not.toHaveProperty('slug');

      repository.findById.mockResolvedValue(null);
      await expect(service.getTemplate('x')).rejects.toThrow(
        'Agent not found: x',
      );
    });
  });

  describe('createIfMissing', () => {
    const seedInput: CreateAgentSeedInput = {
      key: 'inbound',
      name: 'Inbound seed',
      direction: AgentDirection.INBOUND,
      description: 'desc',
      systemPrompt: 'Seed persona SHOULD NOT overwrite existing',
      defaultTaskKey: 'general',
      defaultToolProfileId: PROFILE_ID,
      voice: null,
      model: null,
      temperature: null,
    };

    it('9. missing key creates with isActive true and general task fallback', async () => {
      repository.findByKey.mockResolvedValue(null);
      repository.save.mockImplementation(async (row: Agent) => ({
        id: TEMPLATE_ID,
        ...row,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }));

      await service.createIfMissing({
        ...seedInput,
        defaultTaskKey: '',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'inbound',
          name: 'Inbound seed',
          systemPrompt: seedInput.systemPrompt,
          defaultTaskKey: 'general',
          defaultToolProfileId: PROFILE_ID,
          isActive: true,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('10. existing complete returns without save', async () => {
      repository.findByKey.mockResolvedValue({ ...template });

      const result = await service.createIfMissing(seedInput);

      expect(result.id).toBe(TEMPLATE_ID);
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('11. existing null defaultToolProfileId backfills profile only', async () => {
      const existing = {
        ...template,
        defaultToolProfileId: null,
        systemPrompt: 'Original persona',
      } as Agent;
      repository.findByKey.mockResolvedValue(existing);
      repository.save.mockImplementation(async (row: Agent) => row);

      const result = await service.createIfMissing(seedInput);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultToolProfileId: PROFILE_ID,
          systemPrompt: 'Original persona',
        }),
      );
      expect(result.systemPrompt).toBe('Original persona');
      expect(result.defaultToolProfileId).toBe(PROFILE_ID);
    });

    it('12. existing null defaultTaskKey backfills task; does not overwrite systemPrompt', async () => {
      const existing = {
        ...template,
        defaultTaskKey: null as unknown as string,
        defaultToolProfileId: PROFILE_ID,
        systemPrompt: 'Keep me',
      } as Agent;
      repository.findByKey.mockResolvedValue(existing);
      repository.save.mockImplementation(async (row: Agent) => row);

      await service.createIfMissing({
        ...seedInput,
        systemPrompt: 'DIFFERENT SEED PROMPT',
        defaultTaskKey: 'confirm_appointment',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTaskKey: 'confirm_appointment',
          systemPrompt: 'Keep me',
        }),
      );
      expect(existing.systemPrompt).toBe('Keep me');
    });

    it('13. existing profile already set is not replaced by seed input', async () => {
      const existing = {
        ...template,
        defaultToolProfileId: 'already-set-profile',
      } as Agent;
      repository.findByKey.mockResolvedValue(existing);

      await service.createIfMissing({
        ...seedInput,
        defaultToolProfileId: 'new-seed-profile',
      });

      expect(repository.save).not.toHaveBeenCalled();
      expect(existing.defaultToolProfileId).toBe('already-set-profile');
    });
  });

  describe('update', () => {
    it('14. empty-string onEnter stays silent; whitespace becomes null', async () => {
      const row = { ...template };
      repository.findById.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: Agent) => r);

      await service.update(TEMPLATE_ID, {
        onEnterInstructions: '',
      } as UpdateAgentDto);
      expect(row.onEnterInstructions).toBe('');

      await service.update(TEMPLATE_ID, {
        onEnterInstructions: '   ',
      } as UpdateAgentDto);
      expect(row.onEnterInstructions).toBeNull();
    });

    it('15. invalid defaultToolProfileId does not save', async () => {
      repository.findById.mockResolvedValue({ ...template });
      toolProfilesService.findById.mockRejectedValue(
        new NotFoundException(`Tool profile not found: bad-profile`),
      );

      await expect(
        service.update(TEMPLATE_ID, {
          defaultToolProfileId: 'bad-profile',
        } as UpdateAgentDto),
      ).rejects.toThrow('Tool profile not found: bad-profile');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('16. valid profile update resolves enabledTools in response', async () => {
      const row = { ...template };
      repository.findById.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: Agent) => r);
      toolProfilesService.findById.mockResolvedValue({ id: 'profile-2' });
      toolProfilesService.resolveEnabledToolIds.mockResolvedValue([
        'endCall',
        'booking',
      ]);

      const result = await service.update(TEMPLATE_ID, {
        defaultToolProfileId: 'profile-2',
      } as UpdateAgentDto);

      expect(toolProfilesService.findById).toHaveBeenCalledWith('profile-2');
      expect(row.defaultToolProfileId).toBe('profile-2');
      expect(result.enabledTools).toEqual(['endCall', 'booking']);
      expect(result.toolProfileId).toBe('profile-2');
    });

    it('17. partial update only mutates systemPrompt among entity fields', async () => {
      const row = { ...template };
      repository.findById.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: Agent) => r);

      await service.update(TEMPLATE_ID, {
        systemPrompt: 'New persona only',
      } as UpdateAgentDto);

      expect(row.systemPrompt).toBe('New persona only');
      expect(row.voice).toBe(template.voice);
      expect(row.model).toBe(template.model);
      expect(row.temperature).toBe(template.temperature);
      expect(row.isActive).toBe(true);
      expect(row.key).toBe('inbound');
      expect(row.direction).toBe(AgentDirection.INBOUND);
      expect(row.defaultToolProfileId).toBe(PROFILE_ID);
    });

    it('18. isActive false only saves template row (no org cascade in this service)', async () => {
      const row = { ...template };
      repository.findById.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: Agent) => r);

      const result = await service.update(TEMPLATE_ID, {
        isActive: false,
      } as UpdateAgentDto);

      expect(row.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result.isActive).toBe(false);
      // AgentsService has no OrganizationAgentsRepository — isolation by design
      expect(Object.keys(service as object)).not.toContain(
        'organizationAgentsRepository',
      );
    });

    it('19. speakingRate / deliveryMode / blank voice', async () => {
      const row = { ...template };
      repository.findById.mockResolvedValue(row);
      repository.save.mockImplementation(async (r: Agent) => r);

      await service.update(TEMPLATE_ID, {
        voice: '',
        speakingRate: 1.35,
        deliveryMode: 'CREATIVE',
        temperature: 0.9,
      } as UpdateAgentDto);

      expect(row.voice).toBeNull();
      expect(row.speakingRate).toBe(1.35);
      expect(row.deliveryMode).toBe('CREATIVE');
      expect(row.temperature).toBe(0.9);
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LivekitService } from '../../livekit/livekit.service';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { CreateInboundSipTrunkDto } from '../dto/create-inbound-sip-trunk.dto';
import { CreateSipTrunkDto } from '../dto/create-sip-trunk.dto';
import { UpdateInboundSipTrunkDto } from '../dto/update-inbound-sip-trunk.dto';
import { UpdateSipTrunkDto } from '../dto/update-sip-trunk.dto';
import { SipTrunk, SipTrunkDirection } from '../sip-trunk.entity';
import { SipTrunksRepository } from '../sip-trunks.repository';
import { SipTrunksService } from '../sip-trunks.service';

describe('SipTrunksService', () => {
  let service: SipTrunksService;
  let repository: {
    findByOrganization: jest.Mock;
    findByOrganizationAndDirection: jest.Mock;
    findByIdAndOrg: jest.Mock;
    findByLivekitTrunkId: jest.Mock;
    findActiveOutboundDefault: jest.Mock;
    findByIdsAndOrg: jest.Mock;
    findInboundDrafts: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let organizationsService: { findById: jest.Mock };
  let livekit: {
    createSipOutboundTrunk: jest.Mock;
    createSipInboundTrunk: jest.Mock;
    deleteSipTrunk: jest.Mock;
  };

  const ORG_ID = 'org-id';
  const OUTBOUND_ID = 'outbound-trunk-id';
  const INBOUND_DRAFT_ID = 'inbound-draft-id';
  const INBOUND_LIVE_ID = 'inbound-live-id';
  const AUTH_PASSWORD = 'super-secret-password';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Organization;

  const outboundTrunk: SipTrunk = {
    id: OUTBOUND_ID,
    organizationId: ORG_ID,
    name: 'Primary outbound',
    direction: SipTrunkDirection.OUTBOUND,
    providerAddress: 'sip.telnyx.com',
    authUsername: 'user1',
    authPassword: AUTH_PASSWORD,
    numbers: ['+918065179684'],
    allowedNumbers: [],
    allowedAddresses: [],
    krispEnabled: true,
    livekitTrunkId: 'ST_out_1',
    isActive: true,
    metadata: null,
    publishedAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as SipTrunk;

  const inboundDraft: SipTrunk = {
    id: INBOUND_DRAFT_ID,
    organizationId: ORG_ID,
    name: 'Inbound draft',
    direction: SipTrunkDirection.INBOUND,
    providerAddress: null,
    authUsername: null,
    authPassword: null,
    numbers: ['+15551234567'],
    allowedNumbers: [],
    allowedAddresses: [],
    krispEnabled: true,
    livekitTrunkId: null,
    isActive: true,
    metadata: null,
    publishedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as SipTrunk;

  const inboundLive: SipTrunk = {
    ...inboundDraft,
    id: INBOUND_LIVE_ID,
    name: 'Inbound live',
    livekitTrunkId: 'ST_in_1',
    publishedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as SipTrunk;

  beforeEach(async () => {
    repository = {
      findByOrganization: jest.fn(),
      findByOrganizationAndDirection: jest.fn(),
      findByIdAndOrg: jest.fn(),
      findByLivekitTrunkId: jest.fn(),
      findActiveOutboundDefault: jest.fn(),
      findByIdsAndOrg: jest.fn(),
      findInboundDrafts: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as SipTrunk),
      save: jest.fn(async (row: SipTrunk) => ({
        id: row.id ?? OUTBOUND_ID,
        ...row,
        createdAt: row.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
      remove: jest.fn(async (row: SipTrunk) => row),
    };

    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };

    livekit = {
      createSipOutboundTrunk: jest.fn(),
      createSipInboundTrunk: jest.fn(),
      deleteSipTrunk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SipTrunksService,
        { provide: SipTrunksRepository, useValue: repository },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: LivekitService, useValue: livekit },
      ],
    }).compile();

    service = module.get(SipTrunksService);
  });

  describe('list / get / org gate', () => {
    it('1. listByOrganization gates on org and never exposes authPassword', async () => {
      repository.findByOrganization.mockResolvedValue([outboundTrunk]);

      const result = await service.listByOrganization(ORG_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('authPassword');
      expect(result[0].id).toBe(OUTBOUND_ID);
      expect(result[0].status).toBe('live');
    });

    it('2. propagates NotFound when organization is missing', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(service.listByOrganization(ORG_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.findByOrganization).not.toHaveBeenCalled();
    });

    it('3. listInbound / listOutbound use direction-filtered repo methods', async () => {
      repository.findByOrganizationAndDirection.mockResolvedValue([
        inboundDraft,
      ]);

      await service.listInboundByOrganization(ORG_ID);
      expect(repository.findByOrganizationAndDirection).toHaveBeenCalledWith(
        ORG_ID,
        SipTrunkDirection.INBOUND,
      );

      repository.findByOrganizationAndDirection.mockResolvedValue([
        outboundTrunk,
      ]);
      await service.listOutboundByOrganization(ORG_ID);
      expect(repository.findByOrganizationAndDirection).toHaveBeenCalledWith(
        ORG_ID,
        SipTrunkDirection.OUTBOUND,
      );
    });

    it('4. getOne throws NotFound when findByIdAndOrg returns null', async () => {
      repository.findByIdAndOrg.mockResolvedValue(null);

      await expect(service.getOne(ORG_ID, OUTBOUND_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOne(ORG_ID, OUTBOUND_ID)).rejects.toThrow(
        `SIP trunk not found: ${OUTBOUND_ID} (org ${ORG_ID})`,
      );
    });

    it('5. getInboundOne throws NotFound when trunk is outbound', async () => {
      repository.findByIdAndOrg.mockResolvedValue(outboundTrunk);

      await expect(
        service.getInboundOne(ORG_ID, OUTBOUND_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('6. getOutboundOne throws NotFound when trunk is inbound', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundDraft);

      await expect(
        service.getOutboundOne(ORG_ID, INBOUND_DRAFT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolveOutboundForCall', () => {
    it('7. explicit id not found → NotFound', async () => {
      repository.findByIdAndOrg.mockResolvedValue(null);

      await expect(
        service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('8. explicit id inactive → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue({
        ...outboundTrunk,
        isActive: false,
      });

      await expect(
        service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID),
      ).rejects.toThrow(`SIP trunk is inactive: ${OUTBOUND_ID}`);
    });

    it('9. explicit id inbound → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);

      await expect(
        service.resolveOutboundForCall(ORG_ID, INBOUND_LIVE_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resolveOutboundForCall(ORG_ID, INBOUND_LIVE_ID),
      ).rejects.toThrow(/not outbound/);
    });

    it('10. explicit id missing livekitTrunkId → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue({
        ...outboundTrunk,
        livekitTrunkId: null,
      });

      await expect(
        service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID),
      ).rejects.toThrow(/missing livekitTrunkId/);
    });

    it('11. no id and no active default → BadRequest', async () => {
      repository.findActiveOutboundDefault.mockResolvedValue(null);

      await expect(service.resolveOutboundForCall(ORG_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.resolveOutboundForCall(ORG_ID)).rejects.toThrow(
        `No active outbound SIP trunk for organization ${ORG_ID}`,
      );
    });

    it('12. happy path returns entity (password may be present)', async () => {
      repository.findByIdAndOrg.mockResolvedValue(outboundTrunk);

      const result = await service.resolveOutboundForCall(ORG_ID, OUTBOUND_ID);

      expect(result.id).toBe(OUTBOUND_ID);
      expect(result.authPassword).toBe(AUTH_PASSWORD);
      expect(result.livekitTrunkId).toBe('ST_out_1');
    });
  });

  describe('createOutbound', () => {
    it('13. empty numbers after normalize → BadRequest', async () => {
      const dto: CreateSipTrunkDto = {
        name: 'Trunk',
        numbers: ['  ', ''],
        livekitTrunkId: 'ST_new',
      };

      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        'At least one phone number is required',
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('14. neither livekitTrunkId nor providerAddress → BadRequest', async () => {
      const dto: CreateSipTrunkDto = {
        name: 'Trunk',
        numbers: ['+15551234567'],
      };

      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        /Provide livekitTrunkId/,
      );
      expect(livekit.createSipOutboundTrunk).not.toHaveBeenCalled();
    });

    it('15. link path conflicts when LiveKit id already linked', async () => {
      repository.findByLivekitTrunkId.mockResolvedValue(outboundTrunk);
      const dto: CreateSipTrunkDto = {
        name: 'Trunk',
        numbers: ['+15551234567'],
        livekitTrunkId: 'ST_out_1',
      };

      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createOutbound(ORG_ID, dto)).rejects.toThrow(
        'LiveKit trunk already linked: ST_out_1',
      );
      expect(livekit.createSipOutboundTrunk).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('16. link path success: outbound, live, publishedAt, no password in response', async () => {
      repository.findByLivekitTrunkId.mockResolvedValue(null);
      const dto: CreateSipTrunkDto = {
        name: '  Linked trunk  ',
        numbers: [' +15551234567 ', ''],
        livekitTrunkId: '  ST_linked  ',
        authPassword: AUTH_PASSWORD,
      };

      const result = await service.createOutbound(ORG_ID, dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          name: 'Linked trunk',
          direction: SipTrunkDirection.OUTBOUND,
          livekitTrunkId: 'ST_linked',
          numbers: ['+15551234567'],
          authPassword: AUTH_PASSWORD,
          isActive: true,
        }),
      );
      expect(repository.create.mock.calls[0][0].publishedAt).toBeInstanceOf(
        Date,
      );
      expect(livekit.createSipOutboundTrunk).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('authPassword');
      expect(result.status).toBe('live');
      expect(result.livekitTrunkId).toBe('ST_linked');
    });

    it('17. provision path calls LiveKit and persists returned id', async () => {
      livekit.createSipOutboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_provisioned',
        address: 'sip.telnyx.com',
      });
      const dto: CreateSipTrunkDto = {
        name: '  Provisioned  ',
        numbers: ['+918065179684'],
        providerAddress: '  sip.telnyx.com  ',
        authUsername: 'user1',
        authPassword: AUTH_PASSWORD,
        destinationCountry: 'IN',
      };

      const result = await service.createOutbound(ORG_ID, dto);

      expect(livekit.createSipOutboundTrunk).toHaveBeenCalledWith({
        name: 'Provisioned',
        address: 'sip.telnyx.com',
        numbers: ['+918065179684'],
        authUsername: 'user1',
        authPassword: AUTH_PASSWORD,
        destinationCountry: 'IN',
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          livekitTrunkId: 'ST_provisioned',
          providerAddress: 'sip.telnyx.com',
          direction: SipTrunkDirection.OUTBOUND,
        }),
      );
      expect(result.livekitTrunkId).toBe('ST_provisioned');
      expect(result).not.toHaveProperty('authPassword');
    });

  });

  describe('createInboundDraft', () => {
    it('19. pure draft: no LiveKit call; draft status', async () => {
      const dto: CreateInboundSipTrunkDto = {
        name: '  Inbound  ',
        numbers: [' +15551234567 '],
      };

      const result = await service.createInboundDraft(ORG_ID, dto);

      expect(livekit.createSipInboundTrunk).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: SipTrunkDirection.INBOUND,
          livekitTrunkId: null,
          publishedAt: null,
          providerAddress: null,
          name: 'Inbound',
          numbers: ['+15551234567'],
        }),
      );
      expect(result.status).toBe('draft');
      expect(result.livekitTrunkId).toBeNull();
    });

    it('20. link existing conflicts when LiveKit id already linked', async () => {
      repository.findByLivekitTrunkId.mockResolvedValue(inboundLive);
      const dto: CreateInboundSipTrunkDto = {
        name: 'Linked inbound',
        numbers: ['+15551234567'],
        livekitTrunkId: 'ST_in_1',
      };

      await expect(service.createInboundDraft(ORG_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('21. link success sets publishedAt and live status', async () => {
      repository.findByLivekitTrunkId.mockResolvedValue(null);
      const dto: CreateInboundSipTrunkDto = {
        name: 'Linked inbound',
        numbers: ['+15551234567'],
        livekitTrunkId: 'ST_new_in',
      };

      const result = await service.createInboundDraft(ORG_ID, dto);

      expect(repository.create.mock.calls[0][0].publishedAt).toBeInstanceOf(
        Date,
      );
      expect(repository.create.mock.calls[0][0].livekitTrunkId).toBe(
        'ST_new_in',
      );
      expect(result.status).toBe('live');
    });

    it('22. empty numbers → BadRequest', async () => {
      const dto: CreateInboundSipTrunkDto = {
        name: 'Inbound',
        numbers: ['  '],
      };

      await expect(service.createInboundDraft(ORG_ID, dto)).rejects.toThrow(
        'At least one phone number is required',
      );
    });
  });

  describe('update', () => {
    it('23. outbound update empty numbers → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue({ ...outboundTrunk });
      const dto: UpdateSipTrunkDto = { numbers: ['', '  '] };

      await expect(
        service.updateOutbound(ORG_ID, OUTBOUND_ID, dto),
      ).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('24. outbound update stores authPassword on entity but response omits it', async () => {
      repository.findByIdAndOrg.mockResolvedValue({ ...outboundTrunk });
      repository.save.mockImplementation(async (row: SipTrunk) => row);
      const dto: UpdateSipTrunkDto = {
        authPassword: 'new-secret',
        name: '  Renamed  ',
      };

      const result = await service.updateOutbound(ORG_ID, OUTBOUND_ID, dto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authPassword: 'new-secret',
          name: 'Renamed',
        }),
      );
      expect(result).not.toHaveProperty('authPassword');
      expect(result.name).toBe('Renamed');
    });

    it('25. inbound update wrong direction → NotFound', async () => {
      repository.findByIdAndOrg.mockResolvedValue(outboundTrunk);
      const dto: UpdateInboundSipTrunkDto = { name: 'Nope' };

      await expect(
        service.updateInbound(ORG_ID, OUTBOUND_ID, dto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('26. updates are local only (LiveKit not called)', async () => {
      repository.findByIdAndOrg.mockResolvedValue({ ...inboundDraft });
      repository.save.mockImplementation(async (row: SipTrunk) => row);
      const dto: UpdateInboundSipTrunkDto = {
        name: 'Updated inbound',
        allowedNumbers: [' +1555000 '],
      };

      await service.updateInbound(ORG_ID, INBOUND_DRAFT_ID, dto);

      expect(livekit.createSipInboundTrunk).not.toHaveBeenCalled();
      expect(livekit.deleteSipTrunk).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated inbound',
          allowedNumbers: ['+1555000'],
        }),
      );
    });
  });

  describe('remove', () => {
    it('27. remove / removeOutbound are local-only (no LiveKit delete)', async () => {
      repository.findByIdAndOrg.mockResolvedValue(outboundTrunk);

      await service.remove(ORG_ID, OUTBOUND_ID);
      expect(livekit.deleteSipTrunk).not.toHaveBeenCalled();
      expect(repository.remove).toHaveBeenCalledWith(outboundTrunk);

      repository.remove.mockClear();
      livekit.deleteSipTrunk.mockClear();
      await service.removeOutbound(ORG_ID, OUTBOUND_ID);
      expect(livekit.deleteSipTrunk).not.toHaveBeenCalled();
      expect(repository.remove).toHaveBeenCalledWith(outboundTrunk);
    });

    it('28. removeInbound draft: no LiveKit call, local remove', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundDraft);

      await service.removeInbound(ORG_ID, INBOUND_DRAFT_ID);

      expect(livekit.deleteSipTrunk).not.toHaveBeenCalled();
      expect(repository.remove).toHaveBeenCalledWith(inboundDraft);
    });

    it('29. removeInbound live: deletes LiveKit then local row', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);
      livekit.deleteSipTrunk.mockResolvedValue(undefined);

      await service.removeInbound(ORG_ID, INBOUND_LIVE_ID);

      expect(livekit.deleteSipTrunk).toHaveBeenCalledWith('ST_in_1');
      expect(repository.remove).toHaveBeenCalledWith(inboundLive);
    });

    it('30. LiveKit not-found still removes local row', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);
      livekit.deleteSipTrunk.mockRejectedValue({
        status: 404,
        message: 'not found',
      });

      await service.removeInbound(ORG_ID, INBOUND_LIVE_ID);

      expect(repository.remove).toHaveBeenCalledWith(inboundLive);
    });

    it('30b. LiveKit not_found code still removes local row', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);
      livekit.deleteSipTrunk.mockRejectedValue({
        code: 'not_found',
        message: 'missing',
      });

      await service.removeInbound(ORG_ID, INBOUND_LIVE_ID);

      expect(repository.remove).toHaveBeenCalledWith(inboundLive);
    });

    it('31. LiveKit other error rethrows and does not remove local', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);
      livekit.deleteSipTrunk.mockRejectedValue(new Error('network down'));

      await expect(
        service.removeInbound(ORG_ID, INBOUND_LIVE_ID),
      ).rejects.toThrow('network down');
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('publishInbound', () => {
    it('32. inactive → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue({
        ...inboundDraft,
        isActive: false,
      });

      await expect(
        service.publishInbound(ORG_ID, INBOUND_DRAFT_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.publishInbound(ORG_ID, INBOUND_DRAFT_ID),
      ).rejects.toThrow(/inactive/);
      expect(livekit.createSipInboundTrunk).not.toHaveBeenCalled();
    });

    it('33. already published → ConflictException', async () => {
      repository.findByIdAndOrg.mockResolvedValue(inboundLive);

      await expect(
        service.publishInbound(ORG_ID, INBOUND_LIVE_ID),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.publishInbound(ORG_ID, INBOUND_LIVE_ID),
      ).rejects.toThrow(/already published/);
    });

    it('34. no numbers → BadRequest', async () => {
      repository.findByIdAndOrg.mockResolvedValue({
        ...inboundDraft,
        numbers: [],
      });

      await expect(
        service.publishInbound(ORG_ID, INBOUND_DRAFT_ID),
      ).rejects.toThrow(/requires at least one number/);
    });

    it('35. happy path persists LiveKit id and publishedAt', async () => {
      const draft = { ...inboundDraft };
      repository.findByIdAndOrg.mockResolvedValue(draft);
      livekit.createSipInboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_published',
      });
      repository.save.mockImplementation(async (row: SipTrunk) => row);

      const result = await service.publishInbound(ORG_ID, INBOUND_DRAFT_ID);

      expect(livekit.createSipInboundTrunk).toHaveBeenCalledWith({
        name: draft.name,
        numbers: draft.numbers,
        allowedNumbers: [],
        allowedAddresses: [],
        authUsername: undefined,
        authPassword: undefined,
        krispEnabled: true,
      });
      expect(result.livekitTrunkId).toBe('ST_published');
      expect(result.status).toBe('live');
      expect(result.publishedAt).toBeInstanceOf(Date);
    });

    it('36. publishInboundMany: missing / skipped / failed / published outcomes', async () => {
      const missingId = 'missing-id';
      const outboundId = OUTBOUND_ID;
      const live = { ...inboundLive };
      const draft = { ...inboundDraft };
      const failDraft: SipTrunk = {
        ...inboundDraft,
        id: 'fail-draft',
        isActive: false,
      };

      repository.findByIdsAndOrg.mockResolvedValue([
        live,
        draft,
        failDraft,
        outboundTrunk,
      ]);
      // publishInbound is called for draft and failDraft; failDraft inactive
      repository.findByIdAndOrg.mockImplementation(
        async (_org: string, id: string) => {
          if (id === draft.id) return { ...draft };
          if (id === failDraft.id) return { ...failDraft };
          if (id === live.id) return { ...live };
          if (id === outboundId) return { ...outboundTrunk };
          return null;
        },
      );
      livekit.createSipInboundTrunk.mockResolvedValue({
        sipTrunkId: 'ST_batch',
      });
      repository.save.mockImplementation(async (row: SipTrunk) => row);

      const { results, published } = await service.publishInboundMany(ORG_ID, [
        missingId,
        live.id,
        draft.id,
        failDraft.id,
        outboundId,
      ]);

      expect(results.find((r) => r.id === missingId)?.outcome).toBe('failed');
      expect(results.find((r) => r.id === live.id)?.outcome).toBe('skipped');
      expect(results.find((r) => r.id === draft.id)?.outcome).toBe('published');
      expect(results.find((r) => r.id === failDraft.id)?.outcome).toBe(
        'failed',
      );
      expect(results.find((r) => r.id === outboundId)?.outcome).toBe('failed');
      expect(published).toHaveLength(1);
      expect(published[0].livekitTrunkId).toBe('ST_batch');
    });

    it('36b. publishInboundMany without ids uses findInboundDrafts', async () => {
      repository.findInboundDrafts.mockResolvedValue([]);

      const { results, published } = await service.publishInboundMany(ORG_ID);

      expect(repository.findInboundDrafts).toHaveBeenCalledWith(ORG_ID);
      expect(results).toEqual([]);
      expect(published).toEqual([]);
    });
  });
});

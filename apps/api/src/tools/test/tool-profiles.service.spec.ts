import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { CreateToolProfileDto } from '../dto/create-tool-profile.dto';
import { ToolProfile } from '../tool-profile.entity';
import { ToolProfilesRepository } from '../tool-profiles.repository';
import { KNOWN_TOOL_IDS } from '../known-tools';
import {
  effectiveAssignedToolIds,
  normalizeToolIds,
  repairAssignedToolIds,
  ToolProfilesService,
} from '../tool-profiles.service';

describe('ToolProfilesService', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';
  const PROFILE_ID = 'profile-1';

  let repo: {
    findById: jest.Mock;
    findByKey: jest.Mock;
    findByOrgAndKey: jest.Mock;
    createProfile: jest.Mock;
    saveProfile: jest.Mock;
    replaceTools: jest.Mock;
    listToolIds: jest.Mock;
    findPlatform: jest.Mock;
    findVisibleToOrganization: jest.Mock;
  };
  let organizationsService: {
    findById: jest.Mock;
    save: jest.Mock;
  };
  let service: ToolProfilesService;

  const makeOrg = (
    id: string,
    allowedToolIds: string[] | null = ['endCall'],
  ): Organization =>
    ({
      id,
      name: id,
      slug: id,
      isActive: true,
      allowedToolIds,
    }) as Organization;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByKey: jest.fn(),
      findByOrgAndKey: jest.fn().mockResolvedValue(null),
      createProfile: jest.fn((data) => ({ id: PROFILE_ID, ...data })),
      saveProfile: jest.fn(async (row: ToolProfile) => row),
      replaceTools: jest.fn().mockResolvedValue(undefined),
      listToolIds: jest.fn().mockResolvedValue(['endCall']),
      findPlatform: jest.fn().mockResolvedValue([]),
      findVisibleToOrganization: jest.fn().mockResolvedValue([]),
    };
    organizationsService = {
      findById: jest.fn(),
      save: jest.fn(async (org: Organization) => org),
    };
    service = new ToolProfilesService(
      repo as unknown as ToolProfilesRepository,
      organizationsService as unknown as OrganizationsService,
    );
    repo.findById.mockImplementation(async (id: string) => ({
      id,
      key: 'custom',
      name: 'Custom',
      description: null,
      organizationId: ORG_A,
      tools: [{ toolId: 'endCall' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  describe('repairAssignedToolIds / normalizeToolIds', () => {
    it('1. null allowlist is grandfathered full catalog; empty stored array becomes endCall', () => {
      expect(effectiveAssignedToolIds(null)).toEqual([...KNOWN_TOOL_IDS]);
      expect(repairAssignedToolIds([])).toEqual(['endCall']);
    });

    it('2. unknown ids dropped; endCall always kept', () => {
      expect(
        repairAssignedToolIds(['endCall', 'notATool', 'transferCall']),
      ).toEqual(['endCall', 'transferCall']);
    });

    it('3. normalizeToolIds rejects unknown ids', () => {
      expect(() => normalizeToolIds(['endCall', 'nope'])).toThrow(
        BadRequestException,
      );
    });

    it('4. normalizeToolIds forces endCall even when omitted', () => {
      expect(normalizeToolIds(['transferCall'])).toEqual([
        'endCall',
        'transferCall',
      ]);
    });
  });

  describe('listAssignedToolIds', () => {
    it('5. lazy-repairs empty stored arrays to endCall and persists', async () => {
      const org = makeOrg(ORG_A, []);
      organizationsService.findById.mockResolvedValue(org);

      const ids = await service.listAssignedToolIds(ORG_A);

      expect(ids).toEqual(['endCall']);
      expect(org.allowedToolIds).toEqual(['endCall']);
      expect(organizationsService.save).toHaveBeenCalledWith(org);
    });

    it('5b. null allowlist returns the full catalog and does not persist', async () => {
      const org = makeOrg(ORG_A, null);
      organizationsService.findById.mockResolvedValue(org);

      const ids = await service.listAssignedToolIds(ORG_A);

      expect(ids).toEqual([...KNOWN_TOOL_IDS]);
      expect(org.allowedToolIds).toBeNull();
      expect(organizationsService.save).not.toHaveBeenCalled();
    });

    it('6. returns stored allowlist when already valid', async () => {
      const org = makeOrg(ORG_A, ['endCall', 'transferCall']);
      organizationsService.findById.mockResolvedValue(org);

      const ids = await service.listAssignedToolIds(ORG_A);

      expect(ids).toEqual(['endCall', 'transferCall']);
      expect(organizationsService.save).not.toHaveBeenCalled();
    });

    it('7. missing org → NotFound (does not leak other orgs)', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException('Organization not found: missing'),
      );

      await expect(service.listAssignedToolIds('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replaceAssignedToolIds', () => {
    it('8. grants a known subset and always keeps endCall', async () => {
      const org = makeOrg(ORG_A, ['endCall']);
      organizationsService.findById.mockResolvedValue(org);

      const ids = await service.replaceAssignedToolIds(ORG_A, [
        'transferCall',
        'lookupCustomer',
      ]);

      expect(ids).toEqual(['endCall', 'lookupCustomer', 'transferCall']);
      expect(org.allowedToolIds).toEqual(ids);
      expect(organizationsService.save).toHaveBeenCalledWith(org);
    });

    it('9. unknown tool id → 400', async () => {
      organizationsService.findById.mockResolvedValue(makeOrg(ORG_A));

      await expect(
        service.replaceAssignedToolIds(ORG_A, ['endCall', 'laserBeams']),
      ).rejects.toThrow(BadRequestException);
      expect(organizationsService.save).not.toHaveBeenCalled();
    });

    it('10. empty body still leaves endCall', async () => {
      const org = makeOrg(ORG_A, ['endCall', 'booking']);
      organizationsService.findById.mockResolvedValue(org);

      const ids = await service.replaceAssignedToolIds(ORG_A, []);

      expect(ids).toEqual(['endCall']);
    });
  });

  describe('resolveEnabledToolIds', () => {
    it('11. without orgId returns the profile tools unfiltered', async () => {
      repo.listToolIds.mockResolvedValue([
        'endCall',
        'scheduleGhlMeeting',
      ]);

      const ids = await service.resolveEnabledToolIds(PROFILE_ID);

      expect(ids).toEqual(['endCall', 'scheduleGhlMeeting']);
      expect(organizationsService.findById).not.toHaveBeenCalled();
    });

    it('12. with orgId intersects profile tools with the allowlist', async () => {
      repo.listToolIds.mockResolvedValue([
        'endCall',
        'booking',
        'scheduleGhlMeeting',
      ]);
      organizationsService.findById.mockResolvedValue(
        makeOrg(ORG_A, ['endCall', 'booking']),
      );

      const ids = await service.resolveEnabledToolIds(PROFILE_ID, ORG_A);

      expect(ids).toEqual(['booking', 'endCall']);
    });

    it('13. missing profile id + org allowlist still returns endCall', async () => {
      organizationsService.findById.mockResolvedValue(makeOrg(ORG_A));

      expect(await service.resolveEnabledToolIds(null, ORG_A)).toEqual([
        'endCall',
      ]);
    });

    it('14. org A allowlist does not affect org B', async () => {
      repo.listToolIds.mockResolvedValue(['endCall', 'transferCall']);
      organizationsService.findById.mockImplementation(async (id: string) => {
        if (id === ORG_A) {
          return makeOrg(ORG_A, ['endCall', 'transferCall']);
        }
        return makeOrg(ORG_B, ['endCall']);
      });

      expect(await service.resolveEnabledToolIds(PROFILE_ID, ORG_A)).toEqual([
        'endCall',
        'transferCall',
      ]);
      expect(await service.resolveEnabledToolIds(PROFILE_ID, ORG_B)).toEqual([
        'endCall',
      ]);
    });

    it('14b. null allowlist does not strip profile tools', async () => {
      repo.listToolIds.mockResolvedValue([
        'endCall',
        'scheduleGhlMeeting',
      ]);
      organizationsService.findById.mockResolvedValue(makeOrg(ORG_A, null));

      expect(await service.resolveEnabledToolIds(PROFILE_ID, ORG_A)).toEqual([
        'endCall',
        'scheduleGhlMeeting',
      ]);
    });
  });

  describe('org custom profiles', () => {
    it('15. create rejects a tool not on the org allowlist', async () => {
      organizationsService.findById.mockResolvedValue(makeOrg(ORG_A));

      await expect(
        service.createForOrganization(ORG_A, {
          name: 'GHL pack',
          toolIds: ['endCall', 'scheduleGhlMeeting'],
        } as CreateToolProfileDto),
      ).rejects.toThrow(/not assigned to this organization/i);
      expect(repo.saveProfile).not.toHaveBeenCalled();
    });

    it('16. create accepts tools that are assigned', async () => {
      organizationsService.findById.mockResolvedValue(
        makeOrg(ORG_A, ['endCall', 'transferCall']),
      );

      await service.createForOrganization(ORG_A, {
        name: 'Lite',
        key: 'lite',
        toolIds: ['endCall', 'transferCall'],
      } as CreateToolProfileDto);

      expect(repo.replaceTools).toHaveBeenCalledWith(PROFILE_ID, [
        'endCall',
        'transferCall',
      ]);
    });

    it('17. platform create is not constrained by an org allowlist', async () => {
      await service.createForPlatform({
        name: 'Outbound',
        key: 'outbound-extra',
        toolIds: ['endCall', 'booking', 'transferCall'],
      } as CreateToolProfileDto);

      expect(organizationsService.findById).not.toHaveBeenCalled();
      expect(repo.replaceTools).toHaveBeenCalled();
    });
  });
});

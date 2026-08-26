import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateOrganizationDto } from '../dto/create-organization.dto';
import { Organization } from '../organization.entity';
import { OrganizationsRepository } from '../organizations.repository';
import { OrganizationsService } from '../organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let repository: {
    findById: jest.Mock;
    findBySlug: jest.Mock;
    findAllOrderedByCreatedAtDesc: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const ORG_ID = 'org-id';
  const SLUG = 'acme';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme Call Center',
    slug: SLUG,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as Organization;

  const baseDto: CreateOrganizationDto = {
    name: '  Acme Call Center  ',
    slug: 'Acme',
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findAllOrderedByCreatedAtDesc: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as Organization),
      save: jest.fn(async (row: Organization) => ({
        id: ORG_ID,
        ...row,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: OrganizationsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(OrganizationsService);
  });

  describe('create', () => {
    beforeEach(() => {
      repository.findBySlug.mockResolvedValue(null);
    });

    it('1. lowercases slug for uniqueness lookup and create payload', async () => {
      await service.create(baseDto);

      expect(repository.findBySlug).toHaveBeenCalledWith('acme');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'acme' }),
      );
    });

    it('2. throws ConflictException when slug already exists', async () => {
      repository.findBySlug.mockResolvedValue(org);

      await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
      await expect(service.create(baseDto)).rejects.toThrow(
        'Organization slug already exists: acme',
      );
    });

    it('3. does not create or save when slug conflicts', async () => {
      repository.findBySlug.mockResolvedValue(org);

      await expect(service.create(baseDto)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('4. trims name on create payload', async () => {
      await service.create(baseDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Call Center' }),
      );
    });

    it('5. sets isActive to true by default', async () => {
      await service.create(baseDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('5b. seeds allowedToolIds to endCall only', async () => {
      await service.create(baseDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedToolIds: ['endCall'] }),
      );
    });

    it('6. creates then saves and returns the saved organization', async () => {
      const result = await service.create(baseDto);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          id: ORG_ID,
          name: 'Acme Call Center',
          slug: 'acme',
          isActive: true,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('7. delegates to repository ordered list', async () => {
      repository.findAllOrderedByCreatedAtDesc.mockResolvedValue([org]);

      await expect(service.findAll()).resolves.toEqual([org]);
      expect(repository.findAllOrderedByCreatedAtDesc).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('8. returns organization when found', async () => {
      repository.findById.mockResolvedValue(org);

      await expect(service.findById(ORG_ID)).resolves.toEqual(org);
      expect(repository.findById).toHaveBeenCalledWith(ORG_ID);
    });

    it('9. throws NotFoundException when missing', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(ORG_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findById(ORG_ID)).rejects.toThrow(
        `Organization not found: ${ORG_ID}`,
      );
    });
  });

  describe('findBySlug', () => {
    it('10. lowercases slug before repository call', async () => {
      repository.findBySlug.mockResolvedValue(org);

      await service.findBySlug('AcMe');

      expect(repository.findBySlug).toHaveBeenCalledWith('acme');
    });

    it('11. returns null when repository has no match', async () => {
      repository.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('missing')).resolves.toBeNull();
    });
  });

  describe('findByIdOrSlug', () => {
    it('12. returns by id without falling back to slug', async () => {
      repository.findById.mockResolvedValue(org);

      await expect(service.findByIdOrSlug(ORG_ID)).resolves.toEqual(org);
      expect(repository.findById).toHaveBeenCalledWith(ORG_ID);
      expect(repository.findBySlug).not.toHaveBeenCalled();
    });

    it('13. falls back to slug when id lookup misses', async () => {
      repository.findById.mockResolvedValue(null);
      repository.findBySlug.mockResolvedValue(org);

      await expect(service.findByIdOrSlug('acme')).resolves.toEqual(org);
      expect(repository.findById).toHaveBeenCalledWith('acme');
      expect(repository.findBySlug).toHaveBeenCalledWith('acme');
    });

    it('14. returns null when both id and slug miss', async () => {
      repository.findById.mockResolvedValue(null);
      repository.findBySlug.mockResolvedValue(null);

      await expect(service.findByIdOrSlug('unknown')).resolves.toBeNull();
    });
  });
});

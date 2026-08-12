import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { User, UserRole } from '../user.entity';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: {
    findByIdWithOrganization: jest.Mock;
    findByOrgAndEmail: jest.Mock;
    findByOrganizationOrdered: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let organizationsService: {
    findById: jest.Mock;
  };

  const ORG_ID = 'org-id';
  const USER_ID = 'user-id';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Organization;

  const existingUser: User = {
    id: USER_ID,
    organizationId: ORG_ID,
    email: 'jane@acme.com',
    passwordHash: 'hash-existing',
    name: 'Jane Agent',
    role: UserRole.AGENT,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    organization: org,
  };

  const baseDto: CreateUserDto = {
    email: '  Jane@Acme.COM  ',
    password: 'SecurePass123!',
    name: '  Jane Agent  ',
  };

  beforeEach(async () => {
    usersRepository = {
      findByIdWithOrganization: jest.fn(),
      findByOrgAndEmail: jest.fn(),
      findByOrganizationOrdered: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as User),
      save: jest.fn(async (user: User) => ({
        id: USER_ID,
        ...user,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
    };

    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: usersRepository },
        { provide: OrganizationsService, useValue: organizationsService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('createForOrganization', () => {
    beforeEach(() => {
      usersRepository.findByOrgAndEmail.mockResolvedValue(null);
    });

    it('1. calls organizationsService.findById with organizationId first', async () => {
      await service.createForOrganization(ORG_ID, baseDto);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
      expect(organizationsService.findById).toHaveBeenCalledTimes(1);
    });

    it('2. propagates NotFoundException when organization is missing', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(
        service.createForOrganization(ORG_ID, baseDto),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(usersRepository.findByOrgAndEmail).not.toHaveBeenCalled();
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('3. normalizes email for lookup and create payload', async () => {
      await service.createForOrganization(ORG_ID, baseDto);

      expect(usersRepository.findByOrgAndEmail).toHaveBeenCalledWith(
        ORG_ID,
        'jane@acme.com',
      );
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane@acme.com' }),
      );
    });

    it('4. throws ConflictException when email already exists in org', async () => {
      usersRepository.findByOrgAndEmail.mockResolvedValue(existingUser);

      await expect(
        service.createForOrganization(ORG_ID, baseDto),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createForOrganization(ORG_ID, baseDto),
      ).rejects.toThrow(
        'User already exists in this organization: jane@acme.com',
      );
    });

    it('5. does not create or save when email conflicts', async () => {
      usersRepository.findByOrgAndEmail.mockResolvedValue(existingUser);

      await expect(
        service.createForOrganization(ORG_ID, baseDto),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('6. hashes password — create payload is not the plain password', async () => {
      await service.createForOrganization(ORG_ID, baseDto);

      const createArg = usersRepository.create.mock.calls[0][0] as {
        passwordHash: string;
      };
      expect(createArg.passwordHash).not.toBe(baseDto.password);
      expect(createArg.passwordHash.length).toBeGreaterThan(20);
      expect(createArg.passwordHash.startsWith('$2')).toBe(true);
    });

    it('7. defaults role to AGENT when role is omitted', async () => {
      await service.createForOrganization(ORG_ID, {
        email: 'agent@acme.com',
        password: 'SecurePass123!',
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.AGENT }),
      );
    });

    it('8. preserves provided role', async () => {
      await service.createForOrganization(ORG_ID, {
        email: 'admin@acme.com',
        password: 'SecurePass123!',
        role: UserRole.ORG_ADMIN,
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.ORG_ADMIN }),
      );
    });

    it('9. trims name when provided and uses null when omitted', async () => {
      await service.createForOrganization(ORG_ID, baseDto);
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Agent' }),
      );

      usersRepository.create.mockClear();
      await service.createForOrganization(ORG_ID, {
        email: 'noname@acme.com',
        password: 'SecurePass123!',
      });
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: null }),
      );
    });

    it('10. always sets isActive to true', async () => {
      await service.createForOrganization(ORG_ID, baseDto);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('11. passes organizationId into create', async () => {
      await service.createForOrganization(ORG_ID, baseDto);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID }),
      );
    });

    it('12. calls create then save and returns the save result', async () => {
      const createdEntity = {
        organizationId: ORG_ID,
        email: 'jane@acme.com',
        passwordHash: 'hashed',
        name: 'Jane Agent',
        role: UserRole.AGENT,
        isActive: true,
      } as User;
      const savedEntity: User = {
        ...createdEntity,
        id: USER_ID,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        organization: org,
      };

      usersRepository.create.mockReturnValue(createdEntity);
      usersRepository.save.mockResolvedValue(savedEntity);

      const result = await service.createForOrganization(ORG_ID, baseDto);

      expect(usersRepository.create).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith(createdEntity);
      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(savedEntity);
    });
  });

  describe('listByOrganization', () => {
    it('13. propagates NotFoundException when organization is missing', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(
        service.listByOrganization(ORG_ID),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(usersRepository.findByOrganizationOrdered).not.toHaveBeenCalled();
    });

    it('14. returns ordered users after org is found', async () => {
      const list = [existingUser];
      usersRepository.findByOrganizationOrdered.mockResolvedValue(list);

      const result = await service.listByOrganization(ORG_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
      expect(usersRepository.findByOrganizationOrdered).toHaveBeenCalledWith(
        ORG_ID,
      );
      expect(result).toEqual(list);
    });
  });

  describe('findById', () => {
    it('15. delegates to findByIdWithOrganization and returns row or null', async () => {
      usersRepository.findByIdWithOrganization.mockResolvedValue(existingUser);
      await expect(service.findById(USER_ID)).resolves.toEqual(existingUser);
      expect(usersRepository.findByIdWithOrganization).toHaveBeenCalledWith(
        USER_ID,
      );

      usersRepository.findByIdWithOrganization.mockResolvedValue(null);
      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });

  describe('findByOrgAndEmail', () => {
    it('16. normalizes email before repository call', async () => {
      usersRepository.findByOrgAndEmail.mockResolvedValue(existingUser);

      await expect(
        service.findByOrgAndEmail(ORG_ID, '  Jane@Acme.COM  '),
      ).resolves.toEqual(existingUser);

      expect(usersRepository.findByOrgAndEmail).toHaveBeenCalledWith(
        ORG_ID,
        'jane@acme.com',
      );
    });
  });

  describe('toSafeUser', () => {
    it('17. omits passwordHash from the response shape', () => {
      const safe = service.toSafeUser(existingUser);

      expect(safe).not.toHaveProperty('passwordHash');
      expect(safe).not.toHaveProperty('organization');
    });

    it('18. includes safe identity and status fields', () => {
      const safe = service.toSafeUser(existingUser);

      expect(safe).toEqual({
        id: existingUser.id,
        organizationId: existingUser.organizationId,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
        isActive: existingUser.isActive,
        createdAt: existingUser.createdAt,
        updatedAt: existingUser.updatedAt,
      });
    });
  });

  describe('getOrThrow', () => {
    it('19. returns user when found', async () => {
      usersRepository.findByIdWithOrganization.mockResolvedValue(existingUser);

      await expect(service.getOrThrow(USER_ID)).resolves.toEqual(existingUser);
    });

    it('20. throws NotFoundException when missing', async () => {
      usersRepository.findByIdWithOrganization.mockResolvedValue(null);

      await expect(service.getOrThrow(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOrThrow(USER_ID)).rejects.toThrow(
        `User not found: ${USER_ID}`,
      );
    });
  });
});

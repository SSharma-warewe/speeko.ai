import { Test, TestingModule } from '@nestjs/testing';
import { Admin } from '../admin.entity';
import { AdminsRepository } from '../admins.repository';
import { AdminsService } from '../admins.service';

describe('AdminsService', () => {
  let service: AdminsService;
  let repository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const activeAdmin: Admin = {
    id: 'admin-id',
    email: 'admin@local.dev',
    passwordHash: 'hash-admin',
    name: 'Platform Admin',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  beforeEach(async () => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminsService,
        { provide: AdminsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(AdminsService);
  });

  describe('findByEmail', () => {
    it('1. normalizes email before repository call', async () => {
      repository.findByEmail.mockResolvedValue(activeAdmin);

      await service.findByEmail('  Admin@Local.DEV  ');

      expect(repository.findByEmail).toHaveBeenCalledWith('admin@local.dev');
      expect(repository.findByEmail).toHaveBeenCalledTimes(1);
    });

    it('2. returns admin when repository resolves a row', async () => {
      repository.findByEmail.mockResolvedValue(activeAdmin);

      await expect(service.findByEmail(activeAdmin.email)).resolves.toEqual(
        activeAdmin,
      );
    });

    it('3. returns null when repository resolves null', async () => {
      repository.findByEmail.mockResolvedValue(null);

      await expect(
        service.findByEmail('missing@local.dev'),
      ).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('4. delegates id unchanged to repository', async () => {
      repository.findById.mockResolvedValue(activeAdmin);

      await service.findById('admin-id');

      expect(repository.findById).toHaveBeenCalledWith('admin-id');
      expect(repository.findById).toHaveBeenCalledTimes(1);
    });

    it('5. returns admin when found', async () => {
      repository.findById.mockResolvedValue(activeAdmin);

      await expect(service.findById(activeAdmin.id)).resolves.toEqual(
        activeAdmin,
      );
    });

    it('6. returns null when missing', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('missing-id')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    beforeEach(() => {
      repository.create.mockImplementation((data) => ({ ...data }) as Admin);
      repository.save.mockImplementation(async (admin: Admin) => ({
        id: 'admin-id',
        ...admin,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }));
    });

    it('7. normalizes email on create payload', async () => {
      await service.create({
        email: '  Admin@Local.DEV  ',
        passwordHash: 'hash-admin',
        name: 'Platform Admin',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'admin@local.dev' }),
      );
    });

    it('8. defaults name to null when omitted', async () => {
      await service.create({
        email: 'admin@local.dev',
        passwordHash: 'hash-admin',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: null }),
      );
    });

    it('9. preserves provided name', async () => {
      await service.create({
        email: 'admin@local.dev',
        passwordHash: 'hash-admin',
        name: 'Ops Lead',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ops Lead' }),
      );
    });

    it('10. always sets isActive to true', async () => {
      await service.create({
        email: 'admin@local.dev',
        passwordHash: 'hash-admin',
        name: 'Platform Admin',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('11. passes passwordHash through unchanged', async () => {
      await service.create({
        email: 'admin@local.dev',
        passwordHash: 'already-hashed-value',
        name: 'Platform Admin',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'already-hashed-value' }),
      );
    });

    it('12. calls create then save and returns the save result', async () => {
      const createdEntity = {
        email: 'admin@local.dev',
        passwordHash: 'hash-admin',
        name: 'Platform Admin',
        isActive: true,
      } as Admin;
      const savedEntity: Admin = {
        ...createdEntity,
        id: 'admin-id',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      repository.create.mockReturnValue(createdEntity);
      repository.save.mockResolvedValue(savedEntity);

      const result = await service.create({
        email: 'admin@local.dev',
        passwordHash: 'hash-admin',
        name: 'Platform Admin',
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(createdEntity);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(savedEntity);
    });
  });
});

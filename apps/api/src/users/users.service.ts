import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword, normalizeEmail } from '../common/password.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserRole } from './user.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async createForOrganization(
    organizationId: string,
    dto: CreateUserDto,
  ): Promise<User> {
    await this.organizationsService.findById(organizationId);

    const email = normalizeEmail(dto.email);
    const existing = await this.usersRepository.findByOrgAndEmail(
      organizationId,
      email,
    );
    if (existing) {
      throw new ConflictException(
        `User already exists in this organization: ${email}`,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const user = this.usersRepository.create({
      organizationId,
      email,
      passwordHash,
      name: dto.name?.trim() ?? null,
      role: dto.role ?? UserRole.AGENT,
      isActive: true,
    });
    return this.usersRepository.save(user);
  }

  async listByOrganization(organizationId: string): Promise<User[]> {
    await this.organizationsService.findById(organizationId);
    return this.usersRepository.findByOrganizationOrdered(organizationId);
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findByIdWithOrganization(id);
  }

  findByOrgAndEmail(
    organizationId: string,
    email: string,
  ): Promise<User | null> {
    return this.usersRepository.findByOrgAndEmail(
      organizationId,
      normalizeEmail(email),
    );
  }

  toSafeUser(user: User) {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return user;
  }
}

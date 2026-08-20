import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { normalizeEmail } from '../common/password.util';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserRole } from './user.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly organizationsService: OrganizationsService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async createForOrganization(
    organizationId: string,
    dto: CreateUserDto,
  ): Promise<User> {
    const org = await this.organizationsService.findById(organizationId);

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

    const user = this.usersRepository.create({
      organizationId,
      email,
      passwordHash: null,
      name: dto.name?.trim() ?? null,
      role: dto.role ?? UserRole.AGENT,
      isActive: true,
    });
    const saved = await this.usersRepository.save(user);
    await this.authService.sendUserInvite(saved, {
      name: org.name,
      slug: org.slug,
    });
    return saved;
  }

  async resendInvite(organizationId: string, userId: string): Promise<void> {
    const org = await this.organizationsService.findById(organizationId);
    const user = await this.usersRepository.findByIdWithOrganization(userId);
    if (!user || user.organizationId !== organizationId) {
      throw new NotFoundException(`User not found: ${userId}`);
    }
    if (user.passwordHash) {
      throw new ConflictException('User already has a password');
    }
    await this.authService.sendUserInvite(user, {
      name: org.name,
      slug: org.slug,
    });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = await this.getOrThrow(id);
    user.passwordHash = passwordHash;
    await this.usersRepository.save(user);
  }

  async updateName(id: string, name: string): Promise<void> {
    const user = await this.getOrThrow(id);
    user.name = name;
    await this.usersRepository.save(user);
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
      hasPassword: Boolean(user.passwordHash),
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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByIdWithOrganization(id: string): Promise<User | null> {
    return this.repo.findOne({
      where: { id },
      relations: { organization: true },
    });
  }

  findByOrgAndEmail(
    organizationId: string,
    email: string,
  ): Promise<User | null> {
    return this.repo.findOne({
      where: { organizationId, email },
      relations: { organization: true },
    });
  }

  findByOrganizationOrdered(organizationId: string): Promise<User[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  create(data: DeepPartial<User>): User {
    return this.repo.create(data);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}

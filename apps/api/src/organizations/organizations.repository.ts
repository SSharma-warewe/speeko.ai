import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Organization } from './organization.entity';

@Injectable()
export class OrganizationsRepository {
  constructor(
    @InjectRepository(Organization)
    private readonly repo: Repository<Organization>,
  ) {}

  findById(id: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { slug } });
  }

  findAllOrderedByCreatedAtDesc(): Promise<Organization[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  create(data: DeepPartial<Organization>): Organization {
    return this.repo.create(data);
  }

  save(org: Organization): Promise<Organization> {
    return this.repo.save(org);
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { Organization } from './organization.entity';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizationsRepository: OrganizationsRepository,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const slug = dto.slug.toLowerCase();
    const existing = await this.organizationsRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(`Organization slug already exists: ${slug}`);
    }

    const org = this.organizationsRepository.create({
      name: dto.name.trim(),
      slug,
      isActive: true,
      allowedToolIds: ['endCall'],
    });
    // Queue settings are lazy-created on first queue API access / enqueue.
    return this.organizationsRepository.save(org);
  }

  findAll(): Promise<Organization[]> {
    return this.organizationsRepository.findAllOrderedByCreatedAtDesc();
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.organizationsRepository.findById(id);
    if (!org) {
      throw new NotFoundException(`Organization not found: ${id}`);
    }
    return org;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return this.organizationsRepository.findBySlug(slug.toLowerCase());
  }

  async save(org: Organization): Promise<Organization> {
    return this.organizationsRepository.save(org);
  }
}

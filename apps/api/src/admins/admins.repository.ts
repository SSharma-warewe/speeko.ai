import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Admin } from './admin.entity';

@Injectable()
export class AdminsRepository {
  constructor(
    @InjectRepository(Admin)
    private readonly repo: Repository<Admin>,
  ) {}

  findByEmail(email: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: DeepPartial<Admin>): Admin {
    return this.repo.create(data);
  }

  save(admin: Admin): Promise<Admin> {
    return this.repo.save(admin);
  }
}

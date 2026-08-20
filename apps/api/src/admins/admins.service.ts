import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../common/password.util';
import { Admin } from './admin.entity';
import { AdminsRepository } from './admins.repository';

@Injectable()
export class AdminsService {
  constructor(private readonly adminsRepository: AdminsRepository) {}

  findByEmail(email: string): Promise<Admin | null> {
    return this.adminsRepository.findByEmail(normalizeEmail(email));
  }

  findById(id: string): Promise<Admin | null> {
    return this.adminsRepository.findById(id);
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name?: string | null;
  }): Promise<Admin> {
    const admin = this.adminsRepository.create({
      email: normalizeEmail(data.email),
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      isActive: true,
    });
    return this.adminsRepository.save(admin);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const admin = await this.findById(id);
    if (!admin) {
      return;
    }
    admin.passwordHash = passwordHash;
    await this.adminsRepository.save(admin);
  }

  async updateName(id: string, name: string): Promise<void> {
    const admin = await this.findById(id);
    if (!admin) {
      return;
    }
    admin.name = name;
    await this.adminsRepository.save(admin);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
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

  async updateName(id: string, name: string): Promise<void> {
    await this.getOrThrow(id);
    await this.adminsRepository.updateName(id, name);
  }

  async getOrThrow(id: string): Promise<Admin> {
    const admin = await this.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }
    return admin;
  }
}

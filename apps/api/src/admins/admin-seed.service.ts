import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword, normalizeEmail } from '../common/password.util';
import { AdminsService } from './admins.service';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly adminsService: AdminsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = normalizeEmail(this.config.getOrThrow<string>('ADMIN_EMAIL'));
    const password = this.config.getOrThrow<string>('ADMIN_PASSWORD');
    const name = this.config.get<string>('ADMIN_NAME') || 'Platform Admin';

    const existing = await this.adminsService.findByEmail(email);
    if (existing) {
      this.logger.log(`Admin seed skipped (exists): ${email}`);
      return;
    }

    const passwordHash = await hashPassword(password);
    await this.adminsService.create({ email, passwordHash, name });
    this.logger.log(`Admin seed ready: ${email}`);
  }
}

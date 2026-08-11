import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admin.entity';
import { AdminSeedService } from './admin-seed.service';
import { AdminsRepository } from './admins.repository';
import { AdminsService } from './admins.service';

@Module({
  imports: [TypeOrmModule.forFeature([Admin])],
  providers: [AdminsRepository, AdminsService, AdminSeedService],
  exports: [AdminsService],
})
export class AdminsModule {}

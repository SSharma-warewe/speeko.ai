import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoiceTask, VoiceTaskVersionEntity } from './voice-task.entity';
import { VoiceTasksRepository } from './voice-tasks.repository';
import { VoiceTasksService } from './voice-tasks.service';
import {
  UserVoiceTasksController,
  AdminVoiceTasksController,
  OrganizationVoiceTasksController,
} from './voice-tasks.controller';
@Module({
  imports: [TypeOrmModule.forFeature([VoiceTask, VoiceTaskVersionEntity])],
  providers: [VoiceTasksRepository, VoiceTasksService],
  controllers: [
    UserVoiceTasksController,
    AdminVoiceTasksController,
    OrganizationVoiceTasksController,
  ],
  exports: [VoiceTasksService],
})
export class VoiceTasksModule {}

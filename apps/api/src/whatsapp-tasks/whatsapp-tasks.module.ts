import {
  WhatsAppTaskTest,
  WhatsAppTaskTestTurn,
} from './whatsapp-task-test.entity';
import { WhatsAppTaskTestsService } from './whatsapp-task-tests.service';
import { InternalWhatsAppTaskTestsController } from './internal-whatsapp-task-tests.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  WhatsAppTask,
  WhatsAppTaskVersionEntity,
} from './whatsapp-task.entity';
import { WhatsAppTasksRepository } from './whatsapp-tasks.repository';
import { WhatsAppTasksService } from './whatsapp-tasks.service';
import {
  UserWhatsAppTasksController,
  AdminWhatsAppTasksController,
  OrganizationWhatsAppTasksController,
} from './whatsapp-tasks.controller';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppTask,
      WhatsAppTaskVersionEntity,
      WhatsAppTaskTest,
      WhatsAppTaskTestTurn,
    ]),
  ],
  providers: [
    WhatsAppTasksRepository,
    WhatsAppTasksService,
    WhatsAppTaskTestsService,
  ],
  controllers: [
    InternalWhatsAppTaskTestsController,
    UserWhatsAppTasksController,
    AdminWhatsAppTasksController,
    OrganizationWhatsAppTasksController,
  ],
  exports: [WhatsAppTasksService],
})
export class WhatsAppTasksModule {}

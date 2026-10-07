import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from '../calls/call.entity';
import { CallsModule } from '../calls/calls.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AdminQueueController } from './admin-queue.controller';
import { CallBatch } from './call-batch.entity';
import { CallBatchesRepository } from './call-batches.repository';
import { CallBatchesService } from './call-batches.service';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';
import { OrganizationQueueSettingsRepository } from './organization-queue-settings.repository';
import { OrganizationQueueSettingsService } from './organization-queue-settings.service';
import { QueueClaimService } from './queue-claim.service';
import { QueueAdmission } from './queue-admission.entity';
import { QueueAdmissionRepository } from './queue-admission.repository';
import { QueueAdmissionService } from './queue-admission.service';
import { QueueDialerService } from './queue-dialer.service';
import { QueueRetryService } from './queue-retry.service';
import { QueueStatsService } from './queue-stats.service';
import { UserQueueController } from './user-queue.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationQueueSettings,
      CallBatch,
      Call,
      QueueAdmission,
    ]),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => CallsModule),
  ],
  controllers: [UserQueueController, AdminQueueController],
  providers: [
    OrganizationQueueSettingsRepository,
    OrganizationQueueSettingsService,
    CallBatchesRepository,
    CallBatchesService,
    QueueClaimService,
    QueueAdmissionRepository,
    QueueAdmissionService,
    QueueRetryService,
    QueueDialerService,
    QueueStatsService,
  ],
  exports: [
    QueueAdmissionService,
    OrganizationQueueSettingsService,
    CallBatchesService,
    QueueClaimService,
    QueueRetryService,
    QueueDialerService,
    QueueStatsService,
  ],
})
export class QueueModule {}

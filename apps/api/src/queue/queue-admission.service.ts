import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { QueueAdmissionRepository } from './queue-admission.repository';
import { QUEUE_DEFAULTS, queuePositiveInt } from './queue.defaults';

@Injectable()
export class QueueAdmissionService {
  private readonly logger = new Logger(QueueAdmissionService.name);
  constructor(
    private readonly repository: QueueAdmissionRepository,
    private readonly config: ConfigService,
  ) {}

  admitPending(organizationId: string) {
    return this.repository.admitPending(organizationId, this.leaseSeconds());
  }
  beginDial(admissionId: string) {
    return this.repository.beginDial(admissionId, this.leaseSeconds());
  }

  @Interval(60000)
  async prune(): Promise<void> {
    try {
      await this.repository.prune();
    } catch (error) {
      this.logger.error(
        `Admission cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private leaseSeconds(): number {
    return queuePositiveInt(
      this.config.get('QUEUE_CLAIM_LEASE_SECONDS'),
      QUEUE_DEFAULTS.claimLeaseSeconds,
    );
  }
}

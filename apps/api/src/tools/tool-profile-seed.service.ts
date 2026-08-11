import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ToolProfilesService } from './tool-profiles.service';

@Injectable()
export class ToolProfileSeedService implements OnModuleInit {
  private readonly logger = new Logger(ToolProfileSeedService.name);

  constructor(private readonly toolProfilesService: ToolProfilesService) {}

  async onModuleInit(): Promise<void> {
    await this.toolProfilesService.ensureProfile({
      key: 'default',
      name: 'Default',
      description: 'Minimal tools for general voice calls',
      toolIds: ['endCall'],
    });
    this.logger.log('Tool profile seed ready: default');

    await this.toolProfilesService.ensureProfile({
      key: 'outbound',
      name: 'Outbound',
      description:
        'Outbound sales/ops tools: booking, lookup, transfer, appointment confirm',
      toolIds: [
        'endCall',
        'booking',
        'cancelBooking',
        'transferCall',
        'lookupCustomer',
        'confirmAppointment',
      ],
    });
    this.logger.log('Tool profile seed ready: outbound');
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { AgentDirection } from './agent.entity';
import { AgentsService } from './agents.service';

@Injectable()
export class AgentSeedService implements OnModuleInit {
  private readonly logger = new Logger(AgentSeedService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly toolProfilesService: ToolProfilesService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Idempotent: safe if ToolProfileSeedService already ran.
    const defaultProfile = await this.toolProfilesService.ensureProfile({
      key: 'default',
      name: 'Default',
      description: 'Minimal tools for general voice calls',
      toolIds: ['endCall'],
    });
    const outboundProfile = await this.toolProfilesService.ensureProfile({
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

    await this.agentsService.createIfMissing({
      key: 'inbound',
      name: 'Inbound Call Agent',
      direction: AgentDirection.INBOUND,
      description:
        'Answers inbound phone calls. Persona only; workflows via LiveKit Tasks.',
      systemPrompt: [
        'You are a professional inbound call agent representing the company.',
        'Speak clearly and warmly. Keep replies short and natural for speech.',
        'Follow company policies and never invent facts you were not given.',
        'If you cannot help, offer to escalate or take a message.',
        'Respect privacy and do not collect unnecessary personal data.',
      ].join(' '),
      defaultTaskKey: 'general',
      defaultToolProfileId: defaultProfile.id,
      voice: null,
      model: null,
      temperature: null,
    });
    this.logger.log('Agent seed ready: inbound');

    await this.agentsService.createIfMissing({
      key: 'outbound',
      name: 'Outbound Call Agent',
      direction: AgentDirection.OUTBOUND,
      description:
        'Places outbound phone calls. Persona only; workflows via LiveKit Tasks.',
      systemPrompt: [
        'You are a professional outbound call agent representing the company.',
        'Be polite, concise, and respectful of the person\'s time.',
        'Never pressure the customer. If they are busy or uninterested, accept that gracefully.',
        'Follow company policies and never invent facts you were not given.',
        'Respect privacy and safety guidelines at all times.',
      ].join(' '),
      defaultTaskKey: 'general',
      defaultToolProfileId: outboundProfile.id,
      voice: null,
      model: null,
      temperature: null,
    });
    this.logger.log('Agent seed ready: outbound');
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Call } from '../calls/call.entity';
import { ToolProfile } from '../tools/tool-profile.entity';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';

export type AuthorizationCall = Call & {
  authorizationProfile: ToolProfile | null;
  authorizationIntegration: OrganizationIntegration | null;
};

@Injectable()
export class CallCapabilityAuthorizationRepository {
  constructor(
    @InjectRepository(Call) private readonly calls: Repository<Call>,
  ) {}

  async load(callId: string): Promise<AuthorizationCall | null> {
    // One statement gives each operation a consistent, current authorization view.
    return this.calls
      .createQueryBuilder('call')
      .leftJoinAndSelect('call.organization', 'org')
      .leftJoinAndSelect('call.organizationAgent', 'orgAgent')
      .leftJoinAndSelect('orgAgent.agent', 'template')
      .leftJoinAndMapOne(
        'call.authorizationProfile',
        ToolProfile,
        'profile',
        `profile.id = CASE WHEN call.direction = 'inbound' AND call.medium = 'sip'
         THEN orgAgent.toolProfileId ELSE COALESCE(orgAgent.toolProfileId, template.defaultToolProfileId) END`,
      )
      .leftJoinAndSelect('profile.tools', 'profileTool')
      .leftJoinAndMapOne(
        'call.authorizationIntegration',
        OrganizationIntegration,
        'calendar',
        'calendar.id = orgAgent.calendarIntegrationId',
      )
      .select([
        'call.id',
        'call.organizationId',
        'call.organizationAgentId',
        'call.direction',
        'call.medium',
        'call.context',
        'call.voiceTaskSnapshot',
        'org.id',
        'org.isActive',
        'org.allowedToolIds',
        'orgAgent.id',
        'orgAgent.organizationId',
        'orgAgent.isActive',
        'orgAgent.calendarIntegrationId',
        'template.id',
        'template.isActive',
        'profile.id',
        'profile.organizationId',
        'profileTool.id',
        'profileTool.toolId',
        'calendar.id',
        'calendar.organizationId',
        'calendar.isActive',
        'calendar.provider',
        'calendar.apiKey',
        'calendar.locationId',
        'calendar.calendarId',
        'calendar.grantId',
        'calendar.apiUri',
        'calendar.email',
      ])
      .where('call.id = :callId', { callId })
      .getOne() as Promise<AuthorizationCall | null>;
  }
}

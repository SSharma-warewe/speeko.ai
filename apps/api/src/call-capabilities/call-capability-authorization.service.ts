import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  isVoiceTaskSnapshot,
  KnownToolId,
} from '@call-agent/contracts';
import { Call } from '../calls/call.entity';
import { effectiveAssignedToolIds } from '../tools/tool-profiles.service';
import { CallCapabilityAuthorizationRepository } from './call-capability-authorization.repository';

export type CalendarAuthorizationDenied = {
  ok: false;
  error: string;
  message: string;
};
export type GhlCalendarAuthorization =
  | CalendarAuthorizationDenied
  | {
      ok: true;
      call: Call;
      creds: { token: string; locationId: string; calendarId: string };
    };
export type NylasCalendarAuthorization =
  | CalendarAuthorizationDenied
  | {
      ok: true;
      call: Call;
      creds: {
        apiKey: string;
        grantId: string;
        calendarId: string;
        apiUri: string;
        email: string | null;
      };
    };

@Injectable()
export class CallCapabilityAuthorizationService {
  constructor(
    private readonly repository: CallCapabilityAuthorizationRepository,
  ) {}

  authorizeCalendarTool(
    callId: string,
    toolId: KnownToolId,
    provider: typeof IntegrationProvider.GHL,
  ): Promise<GhlCalendarAuthorization>;
  authorizeCalendarTool(
    callId: string,
    toolId: KnownToolId,
    provider: typeof IntegrationProvider.NYLAS,
  ): Promise<NylasCalendarAuthorization>;
  async authorizeCalendarTool(
    callId: string,
    toolId: KnownToolId,
    provider: typeof IntegrationProvider.GHL | typeof IntegrationProvider.NYLAS,
  ): Promise<GhlCalendarAuthorization | NylasCalendarAuthorization> {
    const denied = (
      error: string,
      message: string,
    ): CalendarAuthorizationDenied => ({ ok: false, error, message });
    const call = await this.repository.load(callId);
    if (!call)
      return denied(
        'call_not_found',
        'Call not found for calendar tool request.',
      );
    if (!call.organizationId || !call.organizationAgentId)
      return denied(
        'no_org_agent',
        'Calendar tools require a call with an organization agent.',
      );
    if (!call.organization?.isActive)
      return denied(
        'organization_inactive',
        'The call organization is inactive.',
      );
    const agent = call.organizationAgent;
    if (!agent || agent.organizationId !== call.organizationId)
      return denied(
        'agent_not_found',
        'Organization agent for this call was not found.',
      );
    if (!agent.isActive || !agent.agent?.isActive)
      return denied(
        'agent_inactive',
        'The call agent or its template is inactive.',
      );
    if (!agent.calendarIntegrationId)
      return denied(
        'calendar_not_linked',
        'No calendar integration is linked to this agent.',
      );
    const integration = call.authorizationIntegration;
    if (!integration || integration.organizationId !== call.organizationId)
      return denied(
        'integration_not_found',
        'The linked calendar integration was not found.',
      );
    if (!integration.isActive)
      return denied(
        'integration_inactive',
        'The linked calendar integration is inactive.',
      );
    if (integration.provider !== provider)
      return denied(
        'unsupported_provider',
        'The linked calendar integration does not support this operation.',
      );
    const profile = call.authorizationProfile;
    if (
      !profile ||
      (profile.organizationId !== null &&
        profile.organizationId !== call.organizationId) ||
      !profile.tools?.some((t) => t.toolId === toolId) ||
      !effectiveAssignedToolIds(call.organization.allowedToolIds).includes(
        toolId,
      )
    )
      return denied(
        'tool_not_allowed',
        'This calendar capability is not currently assigned to the call agent.',
      );
    if (
      call.voiceTaskSnapshot &&
      (!isVoiceTaskSnapshot(call.voiceTaskSnapshot) ||
        !call.voiceTaskSnapshot.definition.toolIds.includes(toolId))
    )
      return denied(
        'tool_not_allowed',
        'This calendar capability is not assigned to the pinned call task.',
      );
    // Provider paths only need the id and context. Do not pass persistence
    // relations (including credentials) to the calendar path or context save.
    const toolCall = { id: call.id, context: call.context } as Call;
    if (provider === IntegrationProvider.GHL) {
      const locationId = integration.locationId?.trim() ?? '';
      const calendarId = integration.calendarId?.trim() ?? '';
      if (!integration.apiKey?.trim() || !locationId || !calendarId)
        return denied(
          'ghl_incomplete',
          'The GoHighLevel connection is missing required calendar credentials.',
        );
      return {
        ok: true,
        call: toolCall,
        creds: { token: integration.apiKey, locationId, calendarId },
      };
    }
    if (!integration.apiKey?.trim() || !integration.grantId?.trim())
      return denied(
        'nylas_incomplete',
        'The Nylas connection is missing required calendar credentials.',
      );
    return {
      ok: true,
      call: toolCall,
      creds: {
        apiKey: integration.apiKey,
        grantId: integration.grantId,
        calendarId: integration.calendarId || 'primary',
        apiUri: integration.apiUri,
        email: integration.email,
      },
    };
  }
}

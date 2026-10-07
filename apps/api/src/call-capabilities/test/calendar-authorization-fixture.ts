import { KNOWN_TOOL_IDS } from '@call-agent/contracts';
import {
  CallCapabilityAuthorizationRepository,
  AuthorizationCall,
} from '../call-capability-authorization.repository';
import { CallCapabilityAuthorizationService } from '../call-capability-authorization.service';

/** Adapts existing provider test fixtures to the new persistence seam, without mocking authorization. */
export function calendarAuthorizationFixture(
  loadCall: () => Promise<Record<string, unknown> | null>,
  loadAgent: () => Promise<Record<string, unknown> | null>,
  loadIntegration: () => Promise<Record<string, unknown> | null>,
) {
  return new CallCapabilityAuthorizationService({
    load: async () => {
      const call = await loadCall();
      if (!call) return null;
      const agent = await Promise.resolve()
        .then(loadAgent)
        .catch(() => null);
      const integration = await Promise.resolve()
        .then(loadIntegration)
        .catch(() => null);
      return {
        ...call,
        organization: {
          id: call.organizationId,
          isActive: true,
          allowedToolIds: null,
        },
        organizationAgent: agent
          ? {
              organizationId: call.organizationId,
              isActive: true,
              agent: { isActive: true },
              ...agent,
            }
          : null,
        authorizationIntegration: integration
          ? { organizationId: call.organizationId, ...integration }
          : null,
        authorizationProfile: {
          organizationId: null,
          tools: KNOWN_TOOL_IDS.map((toolId) => ({ toolId })),
        },
      } as AuthorizationCall;
    },
  } as CallCapabilityAuthorizationRepository);
}

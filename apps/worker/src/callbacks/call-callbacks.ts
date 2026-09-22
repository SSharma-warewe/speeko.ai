/**
 * Domain callbacks to the Nest API (complete, inbound ensure, live job metadata).
 * HTTP transport lives in WorkerApiClient. Never throws.
 */

import type {
  CompleteCallPayload,
  InboundEnsurePayload,
  InboundJobMetadataRequest,
  AgentJobMetadata,
} from '@call-agent/contracts';
import { JobMeta } from '../session/job-metadata.js';
import type { ToolEvent } from '../tools/types.js';
import { WorkerApiClient } from './worker-api-client.js';

export type {
  CompleteCallPayload,
  InboundEnsurePayload,
  InboundJobMetadataRequest,
  ToolEvent,
};

export class CallbackFunctions {
  constructor(private readonly client: WorkerApiClient = new WorkerApiClient(),
              private readonly jobMeta: JobMeta = new JobMeta()

) {}

  async postCallComplete(
    callId: string,
    payload: CompleteCallPayload,
  ): Promise<void> {
    await this.client.postJson(
      `/api/internal/calls/${callId}/complete`,
      payload,
      'call complete',
      `callId=${callId} status=${payload.status}`,
    );
  }

  async postInboundEnsure(
    payload: InboundEnsurePayload,
  ): Promise<string | undefined> {
    const result = await this.client.postJson(
      '/api/internal/calls/inbound',
      payload,
      'inbound ensure',
      `room=${payload.roomName}`,
    );
    if (!result?.ok || !result.text.trim()) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(result.text) as { id?: unknown };
      return typeof parsed.id === 'string' && parsed.id.trim()
        ? parsed.id.trim()
        : undefined;
    } catch {
      console.warn(
        `[agent] inbound ensure: response was not JSON with id room=${payload.roomName}`,
      );
      return undefined;
    }
  }

  async postInboundJobMetadata(
    payload: InboundJobMetadataRequest,
  ): Promise<AgentJobMetadata | undefined> {
    const result = await this.client.postJson(
      `/api/internal/organization-agents/${payload.organizationAgentId}/job-metadata`,
      { organizationId: payload.organizationId },
      'inbound job metadata',
      `orgAgent=${payload.organizationAgentId}`,
    );
    if (!result?.ok || !result.text.trim()) {
      return undefined;
    }
    const parsed = this.jobMeta.parseJobMetadata(result.text);
    if (!parsed.organizationAgentId) {
      console.warn(
        `[agent] inbound job metadata: response missing organizationAgentId orgAgent=${payload.organizationAgentId}`,
      );
      return undefined;
    }
    return parsed;
  }
}

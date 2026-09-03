import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
  SipClient,
  type CreateSipDispatchRuleOptions,
  type CreateSipInboundTrunkOptions,
  type CreateSipOutboundTrunkOptions,
  type CreateSipParticipantOptions,
  type SipDispatchRuleCallee,
  type SipDispatchRuleDirect,
  type SipDispatchRuleIndividual,
} from 'livekit-server-sdk';
import {
  RoomAgentDispatch,
  RoomConfiguration,
  SIPMediaConfig,
  SIPTransport,
} from '@livekit/protocol';
import { livekitHttpHost } from './livekit-url.util';

/**
 * LiveKit hangs up a SIP call if no RTP arrives within 30s of the media
 * path (183 early media / 200 OK). India PSTN often sends 183+SDP with no
 * RTP while still ringing, which killed outbound legs at ~32s as no_answer.
 */
export const SIP_OUTBOUND_MEDIA_TIMEOUT_SECONDS = 90;
/** Align with worker waitForSipAnswer (60s). LiveKit default ringing is 3m. */
export const SIP_OUTBOUND_RINGING_TIMEOUT_SECONDS = 60;

export type CreateRoomParams = {
  name: string;
  emptyTimeout?: number;
  maxParticipants?: number;
  metadata?: string;
};

export type CreateAgentDispatchParams = {
  roomName: string;
  /** Opaque JSON string built by the calls domain. */
  metadata: string;
  agentName?: string;
};

export type CreateParticipantTokenParams = {
  identity: string;
  roomName: string;
  name?: string;
  ttl?: string;
};

export type CreateSipOutboundTrunkParams = {
  name: string;
  address: string;
  numbers: string[];
  authUsername?: string;
  authPassword?: string;
  destinationCountry?: string;
  metadata?: string;
};

export type CreateSipInboundTrunkParams = {
  name: string;
  numbers: string[];
  allowedNumbers?: string[];
  allowedAddresses?: string[];
  authUsername?: string;
  authPassword?: string;
  krispEnabled?: boolean;
  metadata?: string;
};

export type SipDispatchRuleSpec =
  | { type: 'individual'; roomPrefix: string; pin?: string }
  | { type: 'direct'; roomName: string; pin?: string }
  | { type: 'callee'; roomPrefix?: string; pin?: string; randomize?: boolean };

export type CreateSipDispatchRuleParams = {
  name: string;
  rule: SipDispatchRuleSpec;
  trunkIds?: string[];
  hidePhoneNumber?: boolean;
  attributes?: Record<string, string>;
  metadata?: string;
  /** LiveKit agent name for roomConfig.agents dispatch. */
  agentName?: string;
  /** JSON string passed as job metadata to the agent. */
  agentMetadata?: string;
};

export type CreateSipParticipantParams = {
  sipTrunkId: string;
  phoneNumber: string;
  roomName: string;
  fromNumber?: string;
  participantIdentity?: string;
  participantName?: string;
  waitUntilAnswered?: boolean;
  playDialtone?: boolean;
  krispEnabled?: boolean;
  ringingTimeout?: number;
  timeout?: number;
};

/**
 * Thin LiveKit Cloud adapter — rooms, agent dispatch, participant tokens, SIP.
 * Domain/orchestration lives in CallsModule / SipTrunksModule.
 */
@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly agentName: string;
  private readonly roomClient: RoomServiceClient;
  private readonly dispatchClient: AgentDispatchClient;
  private readonly sipClient: SipClient;

  constructor(private readonly config: ConfigService) {
    this.livekitUrl = this.config.getOrThrow<string>('LIVEKIT_URL');
    this.apiKey = this.config.getOrThrow<string>('LIVEKIT_API_KEY');
    this.apiSecret = this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
    this.agentName = this.config.get<string>('LIVEKIT_AGENT_NAME', 'call-agent');
    const host = livekitHttpHost(this.livekitUrl);
    this.roomClient = new RoomServiceClient(host, this.apiKey, this.apiSecret);
    this.dispatchClient = new AgentDispatchClient(host, this.apiKey, this.apiSecret);
    this.sipClient = new SipClient(host, this.apiKey, this.apiSecret);
  }

  getUrl(): string {
    return this.livekitUrl;
  }

  getAgentName(): string {
    return this.agentName;
  }

  async createRoom(params: CreateRoomParams): Promise<{ name: string }> {
    const room = await this.roomClient.createRoom({
      name: params.name,
      emptyTimeout: params.emptyTimeout,
      maxParticipants: params.maxParticipants,
      metadata: params.metadata,
    });
    this.logger.log(`Created room "${room.name}"`);
    return { name: room.name };
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomClient.deleteRoom(roomName);
      this.logger.log(`Deleted room "${roomName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to delete room "${roomName}": ${message}`);
    }
  }

  /**
   * True if a remote callee is still in the room. Prefer matching
   * `expectedIdentity` (SIP participant identity); otherwise any non-agent
   * remote participant counts. Used to avoid deleting a live call when
   * CreateSIPParticipant wait fails after answer.
   */
  async hasRemoteCallee(
    roomName: string,
    options?: { expectedIdentity?: string },
  ): Promise<boolean> {
    try {
      const participants = await this.roomClient.listParticipants(roomName);
      const expected = options?.expectedIdentity?.trim().toLowerCase();
      if (expected) {
        if (
          participants.some((p) => (p.identity ?? '').toLowerCase() === expected)
        ) {
          return true;
        }
      }
      return participants.some((p) => {
        const identity = (p.identity ?? '').toLowerCase();
        if (!identity) {
          return false;
        }
        // LiveKit job agents typically use identities starting with "agent-".
        if (identity.startsWith('agent-')) {
          return false;
        }
        return true;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `listParticipants failed for room "${roomName}": ${message}`,
      );
      return false;
    }
  }

  async createAgentDispatch(
    params: CreateAgentDispatchParams,
  ): Promise<{ id: string; room: string; agentName: string }> {
    const agentName = params.agentName ?? this.agentName;
    const dispatch = await this.dispatchClient.createDispatch(
      params.roomName,
      agentName,
      { metadata: params.metadata },
    );
    this.logger.log(
      `Dispatched agent "${agentName}" to room "${params.roomName}" (dispatch=${dispatch.id})`,
    );
    return {
      id: dispatch.id,
      room: params.roomName,
      agentName,
    };
  }

  async createParticipantToken(params: CreateParticipantTokenParams): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: params.ttl ?? '1h',
    });
    at.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return at.toJwt();
  }

  buildMeetUrl(participantToken: string): string {
    return (
      `https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(this.livekitUrl)}` +
      `&token=${encodeURIComponent(participantToken)}`
    );
  }

  async createSipOutboundTrunk(params: CreateSipOutboundTrunkParams): Promise<{
    sipTrunkId: string;
    name: string;
    address: string;
    numbers: string[];
  }> {
    const opts: CreateSipOutboundTrunkOptions = {
      transport: SIPTransport.SIP_TRANSPORT_AUTO,
      authUsername: params.authUsername,
      authPassword: params.authPassword,
      destinationCountry: params.destinationCountry,
      metadata: params.metadata,
    };
    const trunk = await this.sipClient.createSipOutboundTrunk(
      params.name,
      params.address,
      params.numbers,
      opts,
    );
    this.logger.log(
      `Created SIP outbound trunk "${trunk.name}" id=${trunk.sipTrunkId}`,
    );
    return {
      sipTrunkId: trunk.sipTrunkId,
      name: trunk.name,
      address: trunk.address,
      numbers: trunk.numbers ?? [],
    };
  }

  async updateSipOutboundTrunkFields(
    sipTrunkId: string,
    fields: { destinationCountry?: string },
  ): Promise<void> {
    await this.sipClient.updateSipOutboundTrunkFields(sipTrunkId, fields);
    this.logger.log(
      `Updated LiveKit outbound trunk ${sipTrunkId}` +
        (fields.destinationCountry
          ? ` destinationCountry=${fields.destinationCountry}`
          : ''),
    );
  }

  async listSipOutboundTrunks(): Promise<
    Array<{ sipTrunkId: string; name: string; address: string; numbers: string[] }>
  > {
    const trunks = await this.sipClient.listSipOutboundTrunk();
    return trunks.map((t) => ({
      sipTrunkId: t.sipTrunkId,
      name: t.name,
      address: t.address,
      numbers: t.numbers ?? [],
    }));
  }

  async createSipInboundTrunk(params: CreateSipInboundTrunkParams): Promise<{
    sipTrunkId: string;
    name: string;
    numbers: string[];
  }> {
    const opts: CreateSipInboundTrunkOptions = {
      metadata: params.metadata,
      allowedNumbers:
        params.allowedNumbers && params.allowedNumbers.length > 0
          ? params.allowedNumbers
          : undefined,
      allowedAddresses:
        params.allowedAddresses && params.allowedAddresses.length > 0
          ? params.allowedAddresses
          : undefined,
      authUsername: params.authUsername,
      authPassword: params.authPassword,
      krispEnabled: params.krispEnabled,
    };
    const trunk = await this.sipClient.createSipInboundTrunk(
      params.name,
      params.numbers,
      opts,
    );
    this.logger.log(
      `Created SIP inbound trunk "${trunk.name}" id=${trunk.sipTrunkId}`,
    );
    return {
      sipTrunkId: trunk.sipTrunkId,
      name: trunk.name,
      numbers: trunk.numbers ?? [],
    };
  }

  async createSipDispatchRule(params: CreateSipDispatchRuleParams): Promise<{
    sipDispatchRuleId: string;
    name: string;
  }> {
    const rule = this.toSdkDispatchRule(params.rule);
    const opts: CreateSipDispatchRuleOptions = {
      name: params.name,
      trunkIds: params.trunkIds,
      hidePhoneNumber: params.hidePhoneNumber,
      attributes: params.attributes,
      metadata: params.metadata,
    };

    const agentName = params.agentName?.trim();
    if (agentName) {
      opts.roomConfig = new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName,
            metadata: params.agentMetadata ?? '',
          }),
        ],
      });
    }

    const created = await this.sipClient.createSipDispatchRule(rule, opts);
    this.logger.log(
      `Created SIP dispatch rule "${created.name}" id=${created.sipDispatchRuleId}`,
    );
    return {
      sipDispatchRuleId: created.sipDispatchRuleId,
      name: created.name,
    };
  }

  private toSdkDispatchRule(
    rule: SipDispatchRuleSpec,
  ): SipDispatchRuleDirect | SipDispatchRuleIndividual | SipDispatchRuleCallee {
    if (rule.type === 'direct') {
      return {
        type: 'direct',
        roomName: rule.roomName,
        pin: rule.pin,
      };
    }
    if (rule.type === 'callee') {
      return {
        type: 'callee',
        roomPrefix: rule.roomPrefix ?? '',
        pin: rule.pin,
        randomize: rule.randomize,
      };
    }
    return {
      type: 'individual',
      roomPrefix: rule.roomPrefix,
      pin: rule.pin,
    };
  }

  async deleteSipTrunk(livekitTrunkId: string): Promise<void> {
    await this.sipClient.deleteSipTrunk(livekitTrunkId);
    this.logger.log(`Deleted LiveKit SIP trunk ${livekitTrunkId}`);
  }

  async deleteSipDispatchRule(livekitDispatchRuleId: string): Promise<void> {
    await this.sipClient.deleteSipDispatchRule(livekitDispatchRuleId);
    this.logger.log(`Deleted LiveKit SIP dispatch rule ${livekitDispatchRuleId}`);
  }

  async createSipParticipant(params: CreateSipParticipantParams): Promise<{
    participantId: string;
    participantIdentity: string;
    roomName: string;
    sipCallId: string;
  }> {
    const waitUntilAnswered = params.waitUntilAnswered ?? false;
    const ringingTimeout =
      params.ringingTimeout ??
      (waitUntilAnswered ? SIP_OUTBOUND_RINGING_TIMEOUT_SECONDS : undefined);
    const opts: CreateSipParticipantOptions = {
      fromNumber: params.fromNumber,
      participantIdentity: params.participantIdentity ?? params.phoneNumber,
      participantName: params.participantName ?? params.phoneNumber,
      waitUntilAnswered,
      playDialtone: params.playDialtone,
      krispEnabled: params.krispEnabled,
      ringingTimeout,
      timeout: params.timeout,
    };
    // Only when we wait for answer: 183-with-no-RTP otherwise trips LiveKit's
    // 30s media timer. Fire-and-forget queue dials must not send this — extra
    // media config on the INVITE is enough for Frejun to drop the call unsigned.
    if (waitUntilAnswered) {
      opts.media = new SIPMediaConfig({
        mediaTimeout: {
          seconds: BigInt(SIP_OUTBOUND_MEDIA_TIMEOUT_SECONDS),
        },
      });
    }

    const participant = await this.sipClient.createSipParticipant(
      params.sipTrunkId,
      params.phoneNumber,
      params.roomName,
      opts,
    );

    this.logger.log(
      `SIP participant created identity=${participant.participantIdentity} ` +
        `room=${participant.roomName} sipCallId=${participant.sipCallId}`,
    );

    return {
      participantId: participant.participantId,
      participantIdentity: participant.participantIdentity,
      roomName: participant.roomName,
      sipCallId: participant.sipCallId,
    };
  }
}

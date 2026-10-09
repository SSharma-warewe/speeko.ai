import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import type {
  ActiveHumanCallResponse,
  CreateHumanCallRequest,
  HumanCallResponse,
} from '@call-agent/contracts';
import type { AuthOrgUser } from '../../auth/auth.types';
import { CrmService } from '../../crm/crm.service';
import { LivekitService } from '../../livekit/livekit.service';
import { OrganizationQueueSettingsService } from '../../queue/organization-queue-settings.service';
import { QueueAdmissionService } from '../../queue/queue-admission.service';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { PriceService } from '../../price/price.service';
import { CallsRepository } from '../calls.repository';
import {
  Call,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';
import { HumanCallSession } from '../human-call-session.entity';
import { HumanCallSessionsRepository } from '../human-call-sessions.repository';
import {
  humanContactPhone,
  humanMicrophoneReady,
  humanSipAnswered,
} from '../lib/human-call';
import { newCallRow } from '../lib/call-row';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
} from '../lib/call-state-machine';
import { pickFromNumber } from '../lib/call-phone';
import { toCallResponse } from '../mappers/call-response.mapper';
import { initializeHumanTranscription, endHumanTranscription } from '../lib/human-transcription';
import { HumanCallTranscriptionRepository } from '../human-call-transcription.repository';

@Injectable()
export class HumanCallsService {
  private readonly logger = new Logger(HumanCallsService.name);
  private ticking = false;
  constructor(
    private readonly sessions: HumanCallSessionsRepository,
    private readonly calls: CallsRepository,
    private readonly crm: CrmService,
    private readonly livekit: LivekitService,
    private readonly trunks: SipTrunksService,
    private readonly admission: QueueAdmissionService,
    private readonly settings: OrganizationQueueSettingsService,
    private readonly config: ConfigService,
    private readonly price: PriceService,
    private readonly transcription: HumanCallTranscriptionRepository,
  ) {}

  enabled() {
    return (
      String(this.config.get('HUMAN_CRM_CALLS_ENABLED')).toLowerCase() ===
      'true'
    );
  }
  async active(actor: AuthOrgUser): Promise<ActiveHumanCallResponse> {
    const session = await this.sessions.findActive(actor.id, actor.orgId);
    return {
      enabled: this.enabled(),
      active: session ? this.response(session) : null,
    };
  }
  private response(session: HumanCallSession): HumanCallResponse {
    session.call.humanSession = session;
    const call = toCallResponse(session.call);
    return {
      call: {
        ...call,
        cost: session.call.cost,
        createdAt: call.createdAt.toISOString(),
        updatedAt: call.updatedAt.toISOString(),
        startedAt: call.startedAt?.toISOString() ?? null,
        answeredAt: call.answeredAt?.toISOString() ?? null,
        endedAt: call.endedAt?.toISOString() ?? null,
        dialStartedAt: call.dialStartedAt?.toISOString() ?? null,
        nextAttemptAt: call.nextAttemptAt?.toISOString() ?? null,
        lastFailureAt: call.lastFailureAt?.toISOString() ?? null,
        queueLockedAt: call.queueLockedAt?.toISOString() ?? null,
      },
      session: call.humanCall!,
    };
  }
  private async credentials(session: HumanCallSession) {
    if (
      session.finishedAt ||
      session.phase === 'ending' ||
      session.phase === 'preparing'
    )
      throw new ConflictException('Human call is not joinable');
    if (!session.dialAttemptedAt && session.joinDeadline <= new Date())
      throw new ConflictException('Join deadline expired');
    const token = await this.livekit.createHumanParticipantToken(
      session.browserIdentity,
      session.callerName,
      session.call.roomName!,
    );
    return {
      ...this.response(session),
      meetUrl: this.livekit.buildMeetUrl(token),
      connection: { serverUrl: this.livekit.getUrl(), participantToken: token },
    };
  }
  private assertReplay(
    session: HumanCallSession,
    actor: AuthOrgUser,
    request: CreateHumanCallRequest,
  ) {
    const selection = session.selection;
    if (
      session.userId !== actor.id ||
      selection.crmIntegrationId !== request.crmIntegrationId ||
      selection.crmContactId !== request.crmContactId ||
      selection.sipTrunkId !== request.sipTrunkId ||
      JSON.stringify([...(selection.selectedTools ?? [])].sort()) !==
        JSON.stringify([...(request.selectedTools ?? [])].sort())
    )
      throw new ConflictException(
        'Request ID is already used for another call',
      );
  }
  private async contact(
    orgId: string,
    integrationId: string,
    contactId: string,
  ) {
    const result = await this.crm.execute(orgId, integrationId, {
      action: 'contacts.get',
      params: { id: contactId },
    });
    const contact = result.contact as Record<string, unknown>;
    if (!contact || typeof contact !== 'object')
      throw new BadRequestException('CRM contact is unavailable');
    const phone = humanContactPhone(contact);
    const name =
      [contact.firstName, contact.lastName]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .trim() || String(contact.name || phone);
    return { phone, name: name.slice(0, 255) };
  }
  async create(
    actor: AuthOrgUser,
    request: CreateHumanCallRequest,
  ): Promise<HumanCallResponse> {
    const replay = await this.sessions.findRequest(
      actor.orgId,
      request.requestId,
    );
    if (replay) {
      this.assertReplay(replay, actor, request);
      return replay.phase === 'preparing' ||
        replay.phase === 'ending' ||
        replay.finishedAt
        ? this.response(replay)
        : this.credentials(replay);
    }
    if (!this.enabled())
      throw new ServiceUnavailableException('Human CRM calls are not enabled');
    const contact = await this.contact(
      actor.orgId,
      request.crmIntegrationId,
      request.crmContactId,
    );
    const trunk = await this.trunks.resolveOutboundForCall(
      actor.orgId,
      request.sipTrunkId,
    );
    const fromNumber = pickFromNumber(trunk.numbers);
    if (!fromNumber || !/^\+[1-9]\d{7,14}$/.test(fromNumber))
      throw new BadRequestException(
        'Outbound trunk has no usable caller number',
      );
    const callId = randomUUID();
    const call = this.calls.create(
      newCallRow({
        id: callId,
        executionType: 'human',
        organizationId: actor.orgId,
        direction: 'outbound',
        medium: CallMedium.SIP,
        roomName: `human-${callId}`,
        sipTrunkId: trunk.id,
        toNumber: contact.phone,
        fromNumber,
        participantIdentity: `contact-${callId}`,
      }),
    );
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call.taskStatus = CallTaskStatus.NOT_APPLICABLE;
    initializeHumanTranscription(call);
    const created = await this.sessions.create(
      actor,
      request,
      call,
      contact.name,
    );
    this.assertReplay(created.session, actor, request);
    if (!created.created) return this.response(created.session);
    const session = created.session;
    try {
      await this.livekit.createHumanRoom(session.call.roomName!, { mode: 'human_transcription', callId: session.callId, roomName: session.call.roomName! });
      const prepared = await this.sessions.mutate(
        session.id,
        session.leaseToken,
        (current) => {
          current.roomReadyAt = new Date();
          if (current.phase === 'preparing') current.phase = 'waiting_for_user';
        },
      );
      if (!prepared) throw new ConflictException('Call preparation expired');
      return await this.credentials(prepared);
    } catch (error) {
      await this.requestEnding(session.id, 'preparation_failed', 'failed');
      throw new ServiceUnavailableException(
        'Could not prepare the call; cleanup is in progress',
      );
    } finally {
      await this.sessions.release(session.id, session.leaseToken!);
    }
  }
  async join(actor: AuthOrgUser, callId: string) {
    return this.credentials(await this.sessions.owned(callId, actor));
  }
  async end(actor: AuthOrgUser, callId: string) {
    const session = await this.sessions.owned(callId, actor);
    if (!session.finishedAt)
      await this.requestEnding(
        session.id,
        'ended_by_user',
        session.call.answeredAt ? 'completed' : 'cancelled',
      );
    return this.response((await this.sessions.find(session.id))!);
  }
  private requestEnding(
    id: string,
    reason: string,
    status: 'completed' | 'cancelled' | 'failed',
    token: string | null = null,
  ) {
    return this.sessions.mutate(id, token, (session, call) => {
      if (session.phase === 'ending') return;
      session.phase = 'ending';
      session.endReason = reason;
      session.terminalStatus = status;
      session.cleanupStartedAt = new Date();
      endHumanTranscription(call);
    });
  }
  @Interval(2000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.sessions.claimDue();
      await Promise.all(
        due.map(async (session) => {
          try {
            await this.reconcile(session);
          } catch {
            this.logger.warn(
              `Human call observation unavailable call=${session.callId} phase=${session.phase}`,
            );
          } finally {
            await this.sessions.release(session.id, session.leaseToken!);
          }
        }),
      );
    } catch {
      this.logger.error('Human call supervisor failed to claim work');
    } finally {
      this.ticking = false;
    }
  }
  private async reconcile(session: HumanCallSession) {
    const token = session.leaseToken!;
    if (session.phase === 'ending') return this.cleanup(session);
    if (!(await this.sessions.actorActive(session))) {
      await this.requestEnding(
        session.id,
        'caller_inactive',
        session.call.answeredAt ? 'completed' : 'cancelled',
        token,
      );
      return;
    }
    const participants = await this.livekit.observeHumanRoom(
      session.call.roomName!,
    );
    const now = new Date();
    if (participants === null) {
      await this.requestEnding(
        session.id,
        'room_missing',
        session.call.answeredAt ? 'completed' : 'failed',
        token,
      );
      return;
    }
    const browser = participants.find(
      (participant) => participant.identity === session.browserIdentity,
    );
    const sip = participants.find(
      (participant) => participant.identity === session.sipIdentity,
    );
    if (session.phase === 'preparing') {
      await this.requestEnding(
        session.id,
        'preparation_interrupted',
        'failed',
        token,
      );
      return;
    }
    if (session.phase === 'waiting_for_user') {
      if (now >= session.joinDeadline) {
        await this.requestEnding(
          session.id,
          'join_timeout',
          'cancelled',
          token,
        );
        return;
      }
      if (browser && !session.browserJoinedAt) {
        await this.sessions.mutate(session.id, token, (current, call) => {
          current.browserJoinedAt ??= now;
          call.startedAt ??= now;
        });
        this.logger.log(
          `Human browser observed call=${session.callId} microphoneReady=${humanMicrophoneReady(browser)}`,
        );
      }
      if (humanMicrophoneReady(browser)) await this.dial(session);
      return;
    }
    if (!browser) {
      if (!session.browserMissingSince)
        await this.sessions.mutate(session.id, token, (current) => {
          if (current.phase !== 'ending') {
            current.browserMissingSince = now;
            current.phase = 'reconnecting';
          }
        });
      else if (
        now.getTime() - session.browserMissingSince.getTime() >=
        15_000
      ) {
        await this.requestEnding(
          session.id,
          'browser_disconnected',
          session.call.answeredAt ? 'completed' : 'cancelled',
          token,
        );
        return;
      }
    } else if (session.browserMissingSince)
      await this.sessions.mutate(session.id, token, (current, call) => {
        if (current.phase !== 'ending') {
          current.browserMissingSince = null;
          current.phase = call.answeredAt ? 'connected' : 'dialing';
        }
      });
    if (humanSipAnswered(sip) && !session.call.answeredAt) {
      await this.sessions.mutate(session.id, token, (current, call) => {
        if (current.phase !== 'ending') {
          applyCallEvent(call, CallLifecycleEvent.ANSWERED, CallStatus.READY);
          call.answeredAt = now;
          call.livekitSipCallId =
            sip?.attributes?.['sip.callID'] ?? call.livekitSipCallId;
          current.phase = browser ? 'connected' : 'reconnecting';
        }
      });
      this.logger.log(`Human call answered call=${session.callId}`);
    } else if (
      session.call.answeredAt &&
      (!sip || sip.attributes['sip.callStatus'] === 'hangup')
    ) {
      await this.requestEnding(
        session.id,
        'callee_disconnected',
        'completed',
        token,
      );
    } else if (
      !session.call.answeredAt &&
      sip?.attributes['sip.callStatus'] === 'hangup'
    ) {
      await this.requestEnding(session.id, 'no_answer', 'failed', token);
    } else if (
      !session.call.answeredAt &&
      session.dialAttemptedAt &&
      now.getTime() - session.dialAttemptedAt.getTime() >= 60_000
    ) {
      await this.requestEnding(session.id, 'no_answer', 'failed', token);
    }
  }
  private async dial(session: HumanCallSession) {
    const token = session.leaseToken!;
    const validationStartedAt = Date.now();
    this.logger.log(
      `Human dial validation started call=${session.callId} browserWaitMs=${session.browserJoinedAt ? Math.max(0, validationStartedAt - session.browserJoinedAt.getTime()) : 0}`,
    );
    try {
      const contact = await this.contact(
        session.organizationId,
        session.selection.crmIntegrationId,
        session.crmContactId,
      );
      const trunk = await this.trunks.resolveOutboundForCall(
        session.organizationId,
        session.selection.sipTrunkId,
      );
      if (
        contact.phone !== session.call.toNumber ||
        pickFromNumber(trunk.numbers) !== session.call.fromNumber
      )
        throw new ConflictException(
          'Contact number or caller number changed; start a new call',
        );
      if (!(await this.sessions.actorActive(session)))
        throw new ConflictException('Caller is no longer active');
      // Recheck the actual microphone after upstream validation, before admission.
      const participants = await this.livekit.observeHumanRoom(
        session.call.roomName!,
      );
      if (
        !humanMicrophoneReady(
          participants?.find((p) => p.identity === session.browserIdentity),
        )
      ) {
        this.logger.log(
          `Human dial validation deferred call=${session.callId} reason=microphone_not_ready validationMs=${Date.now() - validationStartedAt}`,
        );
        return;
      }
      await this.settings.getOrCreate(session.organizationId);
      await this.admission.admitImmediate(
        session.organizationId,
        session.callId,
        { sessionId: session.id, leaseToken: token },
      );
      const admitted = await this.sessions.find(session.id);
      if (
        !admitted ||
        admitted.phase !== 'dialing' ||
        admitted.leaseToken !== token
      )
        return;
      this.logger.log(
        `Human dial admitted call=${session.callId} validationMs=${Date.now() - validationStartedAt}`,
      );
      // A committed attempt is never resubmitted, even after timeout or restart.
      try {
        const result = await this.livekit.createSipParticipant({
          humanCall: true,
          sipTrunkId: trunk.livekitTrunkId!,
          phoneNumber: contact.phone,
          roomName: session.call.roomName!,
          fromNumber: session.call.fromNumber!,
          participantIdentity: session.sipIdentity,
          participantName: session.contactName,
          waitUntilAnswered: false,
          playDialtone: true,
          krispEnabled: trunk.krispEnabled,
          timeout: 10,
        });
        await this.sessions.mutate(session.id, token, (current, call) => {
          current.dialSettledAt = new Date();
          if (current.phase !== 'ending')
            call.livekitSipCallId = result.sipCallId || null;
        });
      } catch (error) {
        const code = Number(
          (error as { sipStatusCode?: number | string }).sipStatusCode,
        );
        if (code === 486 || code === 600)
          await this.requestEnding(session.id, 'busy', 'failed', token);
        else
          this.logger.warn(
            `Human dial result uncertain call=${session.callId}; reconciling without retry`,
          );
      }
    } catch (error) {
      const reason =
        error instanceof ConflictException
          ? 'admission_denied'
          : error instanceof BadRequestException
            ? 'contact_or_trunk_invalid'
            : 'validation_unavailable';
      await this.requestEnding(session.id, reason, 'failed', token);
    }
  }
  private async cleanup(session: HumanCallSession) {
    if (
      session.cleanupStartedAt &&
      Date.now() - session.cleanupStartedAt.getTime() > 120_000
    )
      this.logger.error(`Human call cleanup overdue call=${session.callId}`);
    await this.livekit.deleteHumanRoom(session.call.roomName!);
    // An in-flight SIP request can arrive late. Keep the tombstone until its window expires.
    if (
      session.dialAttemptedAt &&
      !session.dialSettledAt &&
      Date.now() - session.dialAttemptedAt.getTime() < 70_000
    )
      return;
    if (
      !session.roomReadyAt &&
      Date.now() < session.joinDeadline.getTime() - 90_000
    )
      return;
    const result = await this.sessions.mutate(
      session.id,
      session.leaseToken,
      (current, call) => {
        if (current.phase !== 'ending') return;
        const status = current.terminalStatus ?? 'failed';
        applyCallEvent(
          call,
          status === 'completed'
            ? CallLifecycleEvent.HUMAN_ENDED
            : status === 'cancelled'
              ? CallLifecycleEvent.HUMAN_CANCELLED
              : CallLifecycleEvent.DIAL_FAILED,
          status,
        );
        call.endedAt = current.cleanupStartedAt ?? new Date();
        call.taskStatus = CallTaskStatus.NOT_APPLICABLE;
        call.nextAttemptAt = null;
        call.errorMessage = status === 'failed' ? current.endReason : null;
        call.lastFailureCode =
          status === 'failed'
            ? current.endReason === 'no_answer'
              ? CallFailureCode.NO_ANSWER
              : current.endReason === 'busy'
                ? CallFailureCode.BUSY
                : CallFailureCode.SIP_ERROR
            : status === 'cancelled'
              ? CallFailureCode.CANCELLED
              : null;
        current.phase = 'ended';
        current.finishedAt = new Date();
      },
    );
    if (result) {
      result.call.humanSession = result;
      try {
        await this.transcription.mutate(result.callId, async (call) => {
          await this.price.fillCostIfMissing(call);
        });
      } catch {
        this.logger.warn(
          `Human call price estimate unavailable call=${session.callId}`,
        );
      }
    }
  }
}

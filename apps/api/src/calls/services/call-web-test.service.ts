import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Agent } from '../../agents/agent.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { AgentsService } from '../../agents/agents.service';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { orgAgentDefaultTaskKey } from '../../agents/org-agent-task';
import { resolveVoiceRuntime } from '../../agents/voice-settings';
import { LivekitService } from '../../livekit/livekit.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { AgentJobMetadata } from '../lib/agent-job-metadata';
import { newCallRow } from '../lib/call-row';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
} from '../lib/call-state-machine';
import { resolveTaskKey } from '../lib/call-task-key';
import { CallMedium, CallStatus } from '../call.entity';
import { CallsRepository } from '../calls.repository';
import { CreateTestCallDto } from '../dto/create-test-call.dto';
import { CreateUserTestCallDto } from '../dto/create-user-test-call.dto';
import { TestCallResponseDto } from '../dto/call-response.dto';
import { toTestCallResponse } from '../mappers/call-response.mapper';

@Injectable()
export class CallWebTestService {
  private readonly logger = new Logger(CallWebTestService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly agentsService: AgentsService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly toolProfilesService: ToolProfilesService,
    private readonly livekit: LivekitService,
  ) {}

  async createTestCall(dto: CreateTestCallDto): Promise<TestCallResponseDto> {
    const agent = await this.resolvePlatformAgent(dto);
    if (!agent.isActive) {
      throw new BadRequestException(`Agent is inactive: ${agent.key}`);
    }

    const taskKey = resolveTaskKey(
      this.logger,
      dto.task,
      agent.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      agent.defaultToolProfileId,
    );

    return this.runWebTest({
      organizationId: null,
      agent,
      taskKey,
      enabledTools,
      context: dto.context,
      roomPrefix: `test-${agent.key}`,
    });
  }

  /**
   * Org-user web test against an assigned organization agent (effective config).
   * API creates room + dispatch + Meet token; worker is voice-only.
   */
  async createOrgAgentTestCall(
    organizationId: string,
    dto: CreateUserTestCallDto,
  ): Promise<TestCallResponseDto> {
    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        dto.organizationAgentId,
      );

    if (!orgAgent.isActive) {
      throw new BadRequestException(
        `Organization agent is inactive: ${dto.organizationAgentId}`,
      );
    }

    const template = orgAgent.agent;
    if (!template) {
      throw new BadRequestException(
        `Organization agent missing template relation: ${orgAgent.id}`,
      );
    }

    const taskKey = resolveTaskKey(
      this.logger,
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
    );

    return this.runWebTest({
      organizationId,
      agent: orgAgent,
      template,
      taskKey,
      enabledTools,
      context: dto.context,
      roomPrefix: `test-org-${template.key}`,
    });
  }

  private async runWebTest(input: {
    organizationId?: string | null;
    agent: Agent | OrganizationAgent;
    template?: Agent;
    taskKey: string;
    enabledTools: string[];
    context?: Record<string, unknown>;
    roomPrefix: string;
  }): Promise<TestCallResponseDto> {
    const {
      organizationId = null,
      agent,
      template,
      taskKey,
      enabledTools,
      context,
      roomPrefix,
    } = input;
    const resolved = template ?? (agent as Agent);
    const agentKey = resolved.key;
    const direction = resolved.direction;
    const agentId = resolved.id;
    const organizationAgentId = template ? agent.id : null;

    const roomName = `${roomPrefix}-${randomUUID().slice(0, 8)}`;
    const participantIdentity = `tester-${randomUUID().slice(0, 8)}`;
    const livekitAgentName = this.livekit.getAgentName();

    let call = this.callsRepository.create(
      newCallRow({
        organizationId,
        organizationAgentId,
        agentId,
        direction,
        medium: CallMedium.WEB,
        roomName,
        livekitAgentName,
        participantIdentity,
        context: context ?? null,
        taskKey,
        attemptCount: 1,
        dialStartedAt: new Date(),
      }),
    );
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call = await this.callsRepository.save(call);

    try {
      const metadata: AgentJobMetadata = {
        callId: call.id,
        ...(organizationId ? { organizationId } : {}),
        agentKey,
        direction,
        medium: CallMedium.WEB,
        task: taskKey,
        prompt: {
          systemPrompt: agent.systemPrompt,
          onEnterInstructions: agent.onEnterInstructions ?? null,
          onExitInstructions: agent.onExitInstructions ?? null,
        },
        enabledTools,
        context,
        participantIdentity,
        ...resolveVoiceRuntime(agent, template),
      };

      await this.livekit.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60,
        metadata: JSON.stringify({
          callId: call.id,
          ...(organizationId ? { organizationId } : {}),
          agentKey,
          task: taskKey,
        }),
      });

      const dispatch = await this.livekit.createAgentDispatch({
        roomName,
        metadata: JSON.stringify(metadata),
      });

      const participantToken = await this.livekit.createParticipantToken({
        identity: participantIdentity,
        name: 'Test caller',
        roomName,
        ttl: '1h',
      });

      call.livekitDispatchId = dispatch.id;
      applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.READY);
      call.startedAt = new Date();
      call = await this.callsRepository.save(call);

      this.logger.log(
        organizationId
          ? `Org test call ready id=${call.id} org=${organizationId} room=${roomName} agentKey=${agentKey} task=${taskKey}`
          : `Test call ready id=${call.id} room=${roomName} agentKey=${agentKey} task=${taskKey}`,
      );

      return toTestCallResponse(
        call,
        {
          agentKey,
          livekitUrl: this.livekit.getUrl(),
          participantToken,
          meetUrl: this.livekit.buildMeetUrl(participantToken),
        },
        { includeCost: true },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      call.errorMessage = message;
      await this.callsRepository.save(call);
      this.logger.error(
        organizationId
          ? `Org test call failed id=${call.id}: ${message}`
          : `Test call failed id=${call.id}: ${message}`,
      );
      throw err;
    }
  }

  private async resolvePlatformAgent(dto: CreateTestCallDto): Promise<Agent> {
    if (!dto.agentKey && !dto.agentId) {
      throw new BadRequestException('Provide agentKey or agentId');
    }
    if (dto.agentId) {
      return this.agentsService.findById(dto.agentId);
    }
    const agent = await this.agentsService.findByKey(dto.agentKey!);
    if (!agent) {
      throw new NotFoundException(`Agent not found for key: ${dto.agentKey}`);
    }
    return agent;
  }
}

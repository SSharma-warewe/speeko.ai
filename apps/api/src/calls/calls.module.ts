import { VoiceTasksModule } from '../voice-tasks/voice-tasks.module';
import { UserVoiceTaskTestsController, AdminVoiceTaskTestsController, OrganizationVoiceTaskTestsController } from './voice-task-tests.controller';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { LivekitModule } from '../livekit/livekit.module';
import { PriceModule } from '../price/price.module';
import { QueueModule } from '../queue/queue.module';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { ToolsModule } from '../tools/tools.module';
import { Call } from './call.entity';
import { CallsController } from './calls.controller';
import { CallsRepository } from './calls.repository';
import { InternalCallsController } from './internal-calls.controller';
import { CallDialService } from './services/call-dial.service';
import { CallFailureService } from './services/call-failure.service';
import { CallWebTestService } from './services/call-web-test.service';
import { CallWorkerService } from './services/call-worker.service';
import { CallsService } from './services/calls.service';
import { UserCallsController } from './user-calls.controller';
import { HumanCallSession } from './human-call-session.entity';
import { HumanCallSessionsRepository } from './human-call-sessions.repository';
import { HumanCallsService } from './services/human-calls.service';
import { UserHumanCallsController } from './user-human-calls.controller';
import { CrmModule } from '../crm/crm.module';
import { HumanCallWorkspaceService } from './services/human-call-workspace.service';
import { HumanCallTranscriptionRepository } from './human-call-transcription.repository';
import { HumanCallTranscriptionService } from './services/human-call-transcription.service';

@Module({
  imports: [
    VoiceTasksModule,
    TypeOrmModule.forFeature([Call, HumanCallSession]),
    CrmModule,
    forwardRef(() => AgentsModule),
    ToolsModule,
    LivekitModule,
    SipTrunksModule,
    PriceModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [UserHumanCallsController, CallsController, UserCallsController, InternalCallsController, UserVoiceTaskTestsController, AdminVoiceTaskTestsController, OrganizationVoiceTaskTestsController],
  providers: [
    HumanCallTranscriptionRepository,
    HumanCallTranscriptionService,
    HumanCallWorkspaceService,
    HumanCallSessionsRepository,
    HumanCallsService,
    CallsRepository,
    CallsService,
    CallWebTestService,
    CallDialService,
    CallWorkerService,
    CallFailureService,
  ],
  exports: [
    CallsService,
    CallsRepository,
    CallDialService,
    CallFailureService,
  ],
})
export class CallsModule {}

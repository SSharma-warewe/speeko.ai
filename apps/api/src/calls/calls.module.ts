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

@Module({
  imports: [
    TypeOrmModule.forFeature([Call]),
    forwardRef(() => AgentsModule),
    ToolsModule,
    LivekitModule,
    SipTrunksModule,
    PriceModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [CallsController, UserCallsController, InternalCallsController],
  providers: [
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

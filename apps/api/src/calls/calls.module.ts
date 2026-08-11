import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { LivekitModule } from '../livekit/livekit.module';
import { QueueModule } from '../queue/queue.module';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { ToolsModule } from '../tools/tools.module';
import { Call } from './call.entity';
import { CallsController } from './calls.controller';
import { CallsRepository } from './calls.repository';
import { CallsService } from './calls.service';
import { InternalCallsController } from './internal-calls.controller';
import { UserCallsController } from './user-calls.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call]),
    forwardRef(() => AgentsModule),
    ToolsModule,
    LivekitModule,
    SipTrunksModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [CallsController, UserCallsController, InternalCallsController],
  providers: [CallsRepository, CallsService],
  exports: [CallsService, CallsRepository],
})
export class CallsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { LivekitModule } from '../livekit/livekit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { SipDispatchRule } from './sip-dispatch-rule.entity';
import { SipDispatchRulesRepository } from './sip-dispatch-rules.repository';
import { SipDispatchRulesService } from './sip-dispatch-rules.service';
import { UserSipDispatchRulesController } from './user-sip-dispatch-rules.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SipDispatchRule]),
    OrganizationsModule,
    LivekitModule,
    AgentsModule,
    forwardRef(() => SipTrunksModule),
  ],
  controllers: [UserSipDispatchRulesController],
  providers: [SipDispatchRulesRepository, SipDispatchRulesService],
  exports: [SipDispatchRulesService],
})
export class SipDispatchRulesModule {}

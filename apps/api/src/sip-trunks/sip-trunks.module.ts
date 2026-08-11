import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LivekitModule } from '../livekit/livekit.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SipDispatchRulesModule } from '../sip-dispatch-rules/sip-dispatch-rules.module';
import { SipTrunk } from './sip-trunk.entity';
import { SipTrunksController } from './sip-trunks.controller';
import { SipTrunksRepository } from './sip-trunks.repository';
import { SipTrunksService } from './sip-trunks.service';
import { UserInboundPublishController } from './user-inbound-publish.controller';
import { UserInboundSipTrunksController } from './user-inbound-sip-trunks.controller';
import { UserOutboundSipTrunksController } from './user-outbound-sip-trunks.controller';
import { UserSipTrunksController } from './user-sip-trunks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SipTrunk]),
    OrganizationsModule,
    LivekitModule,
    forwardRef(() => SipDispatchRulesModule),
  ],
  controllers: [
    SipTrunksController,
    // Static `…/inbound` and `…/outbound` before `…/:id` so path segments are not captured as UUIDs.
    UserInboundSipTrunksController,
    UserOutboundSipTrunksController,
    UserInboundPublishController,
    UserSipTrunksController,
  ],
  providers: [SipTrunksRepository, SipTrunksService],
  exports: [SipTrunksService],
})
export class SipTrunksModule {}

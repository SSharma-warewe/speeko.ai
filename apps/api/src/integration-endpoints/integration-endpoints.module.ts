import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { CallsModule } from '../calls/calls.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SipTrunksModule } from '../sip-trunks/sip-trunks.module';
import { IntegrationEndpoint } from './integration-endpoint.entity';
import { IntegrationEndpointsRepository } from './integration-endpoints.repository';
import { IntegrationEndpointsService } from './integration-endpoints.service';
import { PublicIntegrationsController } from './public-integrations.controller';
import { UserIntegrationEndpointsController } from './user-integration-endpoints.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationEndpoint]),
    OrganizationsModule,
    AgentsModule,
    SipTrunksModule,
    CallsModule,
  ],
  controllers: [
    UserIntegrationEndpointsController,
    PublicIntegrationsController,
  ],
  providers: [IntegrationEndpointsRepository, IntegrationEndpointsService],
  exports: [IntegrationEndpointsService],
})
export class IntegrationEndpointsModule {}

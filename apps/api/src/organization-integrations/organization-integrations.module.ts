import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { CallsModule } from '../calls/calls.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CalendarToolsService } from './calendar-tools.service';
import { InternalCalendarController } from './internal-calendar.controller';
import { NylasService } from './nylas.service';
import { OrganizationIntegration } from './organization-integration.entity';
import { OrganizationIntegrationsRepository } from './organization-integrations.repository';
import { OrganizationIntegrationsService } from './organization-integrations.service';
import { UserOrganizationIntegrationsController } from './user-organization-integrations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationIntegration]),
    OrganizationsModule,
    forwardRef(() => AgentsModule),
    forwardRef(() => CallsModule),
  ],
  controllers: [
    UserOrganizationIntegrationsController,
    InternalCalendarController,
  ],
  providers: [
    OrganizationIntegrationsRepository,
    OrganizationIntegrationsService,
    NylasService,
    CalendarToolsService,
  ],
  exports: [OrganizationIntegrationsService, NylasService],
})
export class OrganizationIntegrationsModule {}

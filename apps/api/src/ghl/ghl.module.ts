import { Global, Module, forwardRef } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { CallsModule } from '../calls/calls.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { GhlCalendarToolsService } from './ghl-calendar-tools.service';
import { GhlService } from './ghl.service';
import { InternalGhlCalendarController } from './internal-ghl-calendar.controller';

/**
 * GoHighLevel adapter: CRM upsert + org-scoped calendar tools.
 * Calendar HTTP stays in GhlService; worker routes are secret-guarded.
 */
@Global()
@Module({
  imports: [
    forwardRef(() => CallsModule),
    forwardRef(() => AgentsModule),
    forwardRef(() => OrganizationIntegrationsModule),
  ],
  controllers: [InternalGhlCalendarController],
  providers: [GhlService, GhlCalendarToolsService],
  exports: [GhlService],
})
export class GhlModule {}

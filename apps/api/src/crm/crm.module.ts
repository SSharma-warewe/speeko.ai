import { Module, forwardRef } from '@nestjs/common';
import { GhlModule } from '../ghl/ghl.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { CrmService } from './crm.service';
import { UserCrmController } from './user-crm.controller';

@Module({
  imports: [OrganizationIntegrationsModule, forwardRef(() => GhlModule)],
  controllers: [UserCrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}

import { Module } from '@nestjs/common';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { CrmService } from './crm.service';
import { UserCrmController } from './user-crm.controller';

@Module({
  imports: [OrganizationIntegrationsModule],
  controllers: [UserCrmController],
  providers: [CrmService],
})
export class CrmModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminOrgToolProfilesController } from './admin-org-tool-profiles.controller';
import { ToolProfileSeedService } from './tool-profile-seed.service';
import { ToolProfileTool } from './tool-profile-tool.entity';
import { ToolProfile } from './tool-profile.entity';
import { ToolProfilesController } from './tool-profiles.controller';
import { ToolProfilesRepository } from './tool-profiles.repository';
import { ToolProfilesService } from './tool-profiles.service';
import { UserToolProfilesController } from './user-tool-profiles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ToolProfile, ToolProfileTool])],
  controllers: [
    ToolProfilesController,
    UserToolProfilesController,
    AdminOrgToolProfilesController,
  ],
  providers: [
    ToolProfilesRepository,
    ToolProfilesService,
    ToolProfileSeedService,
  ],
  exports: [ToolProfilesService],
})
export class ToolsModule {}

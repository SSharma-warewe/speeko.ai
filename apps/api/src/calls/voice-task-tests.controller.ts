import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsUUID, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { orgIdFrom } from '../auth/org-id';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { VoiceTasksService } from '../voice-tasks/voice-tasks.service';
import { CallWebTestService } from './services/call-web-test.service';
class VoiceTaskTestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() organizationAgentId!: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Admin platform tests only',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/voice-tasks')
export class UserVoiceTaskTestsController {
  constructor(
    private readonly tasks: VoiceTasksService,
    private readonly tests: CallWebTestService,
  ) {}
  @Post(':id/test')
  @HttpCode(200)
  async test(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskTestDto,
  ) {
    const org = orgIdFrom(p);
    const snapshot = await this.tasks.draftSnapshot(org, id, dto.revision);
    return this.tests.createOrgAgentTestCall(
      org,
      { organizationAgentId: dto.organizationAgentId, context: dto.context },
      snapshot,
    );
  }
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/voice-tasks')
export class OrganizationVoiceTaskTestsController {
  constructor(
    private readonly tasks: VoiceTasksService,
    private readonly tests: CallWebTestService,
  ) {}
  @Post(':id/test')
  @HttpCode(200)
  async test(
    @Param('orgId', ParseResourceIdPipe('Organization')) org: string,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskTestDto,
  ) {
    const snapshot = await this.tasks.draftSnapshot(org, id, dto.revision);
    return this.tests.createOrgAgentTestCall(
      org,
      { organizationAgentId: dto.organizationAgentId, context: dto.context },
      snapshot,
    );
  }
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/voice-tasks')
export class AdminVoiceTaskTestsController {
  constructor(
    private readonly tasks: VoiceTasksService,
    private readonly tests: CallWebTestService,
  ) {}
  @Post(':id/test')
  @HttpCode(200)
  async test(
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskTestDto,
  ) {
    if (!dto.organizationId)
      throw new BadRequestException('Select an organization for this test');
    const snapshot = await this.tasks.draftSnapshot(null, id, dto.revision);
    return this.tests.createOrgAgentTestCall(
      dto.organizationId,
      { organizationAgentId: dto.organizationAgentId, context: dto.context },
      snapshot,
    );
  }
}

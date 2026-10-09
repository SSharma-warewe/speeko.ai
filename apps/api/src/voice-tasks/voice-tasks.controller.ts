import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger';
import { IsInt, IsObject, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { orgIdFrom } from '../auth/org-id';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { VoiceTasksService } from './voice-tasks.service';

export class VoiceTaskDefinitionDto {
  @ApiProperty({
    type: Object,
    description:
      'Validated VoiceTaskDefinition, including optional savedSpeech (up to 20 fixed sentences, hook selections, opt-in per-tool waiting messages) and phase sentenceKeys; no executable code or schemas.',
  })
  @IsObject()
  definition!: Record<string, unknown>;
}
export class VoiceTaskRevisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) revision!: number;
}
export class VoiceTaskDraftDto extends VoiceTaskRevisionDto {
  @ApiProperty({
    type: Object,
    description:
      'Validated VoiceTaskDefinition, including optional savedSpeech (up to 20 fixed sentences, hook selections, opt-in per-tool waiting messages) and phase sentenceKeys; no executable code or schemas.',
  })
  @IsObject()
  definition!: Record<string, unknown>;
}
abstract class VoiceTasksControllerBase {
  constructor(protected readonly tasks: VoiceTasksService) {}
  abstract scope(principal: AuthPrincipal, orgId?: string): string | null;
  @Get()
  @ApiOperation({ summary: 'List visible voice tasks and published templates' })
  list(@CurrentUser() p: AuthPrincipal, @Param('orgId') org?: string) {
    return this.tasks.list(this.scope(p, org));
  }
  @Get(':id')
  get(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.get(this.scope(p, org), id);
  }
  @Post()
  create(
    @CurrentUser() p: AuthPrincipal,
    @Body() dto: VoiceTaskDefinitionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.create(this.scope(p, org), dto.definition);
  }
  @Patch(':id/draft')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskDraftDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.update(
      this.scope(p, org),
      id,
      dto.revision,
      dto.definition,
    );
  }
  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskRevisionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.publish(this.scope(p, org), id, dto.revision);
  }
  @Post(':id/clone')
  clone(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.clone(this.scope(p, org), id);
  }
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.archive(this.scope(p, org), id);
  }
  @Get(':id/versions')
  history(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.history(this.scope(p, org), id);
  }
  @Post(':id/preview')
  @HttpCode(200)
  preview(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Voice task')) id: string,
    @Body() dto: VoiceTaskRevisionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.preview(this.scope(p, org), id, dto.revision);
  }
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/voice-tasks')
export class UserVoiceTasksController extends VoiceTasksControllerBase {
  constructor(tasks: VoiceTasksService) {
    super(tasks);
  }
  scope(p: AuthPrincipal) {
    return orgIdFrom(p);
  }
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/voice-tasks')
export class AdminVoiceTasksController extends VoiceTasksControllerBase {
  constructor(tasks: VoiceTasksService) {
    super(tasks);
  }
  scope() {
    return null;
  }
}
@ApiTags('voice-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/voice-tasks')
export class OrganizationVoiceTasksController extends VoiceTasksControllerBase {
  constructor(tasks: VoiceTasksService) {
    super(tasks);
  }
  scope(_p: AuthPrincipal, orgId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        orgId,
      )
    )
      throw new NotFoundException('Organization not found');
    return orgId;
  }
}

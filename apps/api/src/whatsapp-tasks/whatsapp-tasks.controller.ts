import { WhatsAppTaskTestsService } from './whatsapp-task-tests.service';
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
import {
  IsInt,
  IsObject,
  Min,
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
  IsArray,
  IsIn,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { orgIdFrom } from '../auth/org-id';
import { WHATSAPP_AGENT_TOOL_IDS } from '@call-agent/contracts';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { WhatsAppTasksService } from './whatsapp-tasks.service';

export class WhatsAppTaskDefinitionDto {
  @ApiProperty({
    type: Object,
    description:
      'Validated WhatsAppTaskDefinition; no executable code or schemas.',
  })
  @IsObject()
  definition!: Record<string, unknown>;
}
export class WhatsAppTaskRevisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) revision!: number;
}
export class WhatsAppTaskDraftDto extends WhatsAppTaskRevisionDto {
  @ApiProperty({
    type: Object,
    description:
      'Validated WhatsAppTaskDefinition; no executable code or schemas.',
  })
  @IsObject()
  definition!: Record<string, unknown>;
}
export class WhatsAppTaskTestDto extends WhatsAppTaskRevisionDto {
  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  persona!: string;
  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
  @ApiProperty({
    required: false,
    enum: WHATSAPP_AGENT_TOOL_IDS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(WHATSAPP_AGENT_TOOL_IDS, { each: true })
  simulatedFailureTools?: import('@call-agent/contracts').WhatsAppAgentToolId[];
}
export class WhatsAppTaskTestMessageDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4096) body!: string;
  @ApiProperty() @IsUUID() clientMessageId!: string;
}
abstract class WhatsAppTasksControllerBase {
  constructor(
    protected readonly tasks: WhatsAppTasksService,
    protected readonly tests: WhatsAppTaskTestsService,
  ) {}
  abstract scope(principal: AuthPrincipal, orgId?: string): string | null;
  @Post(':id/tests')
  testsCreate(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Body() dto: WhatsAppTaskTestDto,
    @Param('orgId') org?: string,
  ) {
    return this.tests.create(this.scope(p, org), id, dto);
  }
  @Get(':id/tests/:testId')
  testsGet(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('testId', ParseResourceIdPipe('Task test')) testId: string,
    @Param('orgId') org?: string,
  ) {
    return this.tests.inspect(this.scope(p, org), id, testId);
  }
  @Post(':id/tests/:testId/reset')
  @HttpCode(200)
  testsReset(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('testId', ParseResourceIdPipe('Task test')) testId: string,
    @Param('orgId') org?: string,
  ) {
    return this.tests.reset(this.scope(p, org), id, testId);
  }
  @Post(':id/tests/:testId/messages')
  @HttpCode(202)
  testsMessage(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('testId', ParseResourceIdPipe('Task test')) testId: string,
    @Body() dto: WhatsAppTaskTestMessageDto,
    @Param('orgId') org?: string,
  ) {
    return this.tests.message(
      this.scope(p, org),
      id,
      testId,
      dto.body,
      dto.clientMessageId,
    );
  }
  @Get()
  @ApiOperation({
    summary: 'List visible WhatsApp tasks and published templates',
  })
  list(@CurrentUser() p: AuthPrincipal, @Param('orgId') org?: string) {
    return this.tasks.list(this.scope(p, org));
  }
  @Get(':id')
  get(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.get(this.scope(p, org), id);
  }
  @Post()
  create(
    @CurrentUser() p: AuthPrincipal,
    @Body() dto: WhatsAppTaskDefinitionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.create(this.scope(p, org), dto.definition);
  }
  @Patch(':id/draft')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Body() dto: WhatsAppTaskDraftDto,
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
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Body() dto: WhatsAppTaskRevisionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.publish(this.scope(p, org), id, dto.revision);
  }
  @Post(':id/clone')
  clone(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.clone(this.scope(p, org), id);
  }
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.archive(this.scope(p, org), id);
  }
  @Get(':id/versions')
  history(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.history(this.scope(p, org), id);
  }
  @Post(':id/preview')
  @HttpCode(200)
  preview(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp task')) id: string,
    @Body() dto: WhatsAppTaskRevisionDto,
    @Param('orgId') org?: string,
  ) {
    return this.tasks.preview(this.scope(p, org), id, dto.revision);
  }
}
@ApiTags('whatsapp-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp-tasks')
export class UserWhatsAppTasksController extends WhatsAppTasksControllerBase {
  constructor(tasks: WhatsAppTasksService, tests: WhatsAppTaskTestsService) {
    super(tasks, tests);
  }
  scope(p: AuthPrincipal) {
    return orgIdFrom(p);
  }
}
@ApiTags('whatsapp-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/whatsapp-tasks')
export class AdminWhatsAppTasksController extends WhatsAppTasksControllerBase {
  constructor(tasks: WhatsAppTasksService, tests: WhatsAppTaskTestsService) {
    super(tasks, tests);
  }
  scope() {
    return null;
  }
}
@ApiTags('whatsapp-tasks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/whatsapp-tasks')
export class OrganizationWhatsAppTasksController extends WhatsAppTasksControllerBase {
  constructor(tasks: WhatsAppTasksService, tests: WhatsAppTaskTestsService) {
    super(tasks, tests);
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

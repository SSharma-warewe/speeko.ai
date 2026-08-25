import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { AssignAgentDto } from './dto/assign-agent.dto';
import { AgentResponseDto } from './dto/agent-response.dto';
import { CloneOrganizationAgentDto } from './dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from './dto/update-organization-agent.dto';
import { OrganizationAgentsService } from './organization-agents.service';

@ApiTags('organization-agents')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/agents')
export class OrganizationAgentsController {
  constructor(
    private readonly organizationAgentsService: OrganizationAgentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List organization agent configs (multiple per template allowed; named by slug)',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  @ApiNotFoundError('Organization not found')
  list(@Param('orgId', ParseResourceIdPipe('Organization')) orgId: string) {
    return this.organizationAgentsService.listByOrganization(orgId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create an org agent config from a platform template (persona + tools + hooks). Same template may be used multiple times with different names/slugs.',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Organization not found')
  @ApiConflictError('Slug already exists')
  assign(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Body() dto: AssignAgentDto,
  ) {
    return this.organizationAgentsService.assign(orgId, dto);
  }

  @Post(':id/clone')
  @ApiOperation({
    summary:
      'Clone an organization agent config (new name/slug; copies prompt, hooks, tools, task)',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Organization or agent not found')
  @ApiConflictError('Slug already exists')
  clone(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
    @Body() dto: CloneOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.clone(orgId, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one organization agent (effective config)' })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Organization or agent not found')
  getOne(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
  ) {
    return this.organizationAgentsService.getOne(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update organization agent config (name/slug, persona prompt, tool profile, task, voice/model, active)',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Organization or agent not found')
  @ApiConflictError('Slug already exists')
  update(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
    @Body() dto: UpdateOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete organization agent config (blocked if referenced by integrations / dispatch rules)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('Organization or agent not found')
  @ApiConflictError('Agent is referenced by integrations or dispatch rules')
  async remove(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
  ): Promise<void> {
    await this.organizationAgentsService.remove(orgId, id);
  }
}

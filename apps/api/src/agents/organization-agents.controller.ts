import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AssignAgentDto } from './dto/assign-agent.dto';
import { AgentResponseDto } from './dto/agent-response.dto';
import { CloneOrganizationAgentDto } from './dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from './dto/update-organization-agent.dto';
import { OrganizationAgentsService } from './organization-agents.service';

@ApiTags('organization-agents')
@ApiBearerAuth('bearer')
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
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.organizationAgentsService.listByOrganization(orgId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create an org agent config from a platform template (persona + tools + hooks). Same template may be used multiple times with different names/slugs.',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  assign(
    @Param('orgId', ParseUUIDPipe) orgId: string,
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
  clone(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.clone(orgId, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one organization agent (effective config)' })
  @ApiOkResponse({ type: AgentResponseDto })
  getOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.organizationAgentsService.getOne(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update organization agent config (name/slug, persona prompt, tool profile, task, voice/model, active)',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
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
  async remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.organizationAgentsService.remove(orgId, id);
  }
}

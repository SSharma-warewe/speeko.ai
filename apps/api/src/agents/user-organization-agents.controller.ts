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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { orgIdFrom } from '../auth/org-id';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { AgentsService } from './agents.service';
import { AgentResponseDto } from './dto/agent-response.dto';
import { AssignAgentDto } from './dto/assign-agent.dto';
import { CloneOrganizationAgentDto } from './dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from './dto/update-organization-agent.dto';
import { OrganizationAgentsService } from './organization-agents.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller()
export class UserOrganizationAgentsController {
  constructor(
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly agentsService: AgentsService,
  ) {}

  @Get('users/agent-templates')
  @ApiOperation({
    summary:
      'List platform agent templates available as starters when creating org agent configs',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  listAgentTemplates() {
    return this.agentsService.listTemplates();
  }

  @Get('users/agents')
  @ApiOperation({
    summary:
      'List agent configs for the current organization (multiple per template allowed)',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  listAgents(@CurrentUser() principal: AuthPrincipal) {
    return this.organizationAgentsService.listByOrganization(
      orgIdFrom(principal),
    );
  }

  @Post('users/agents')
  @ApiOperation({
    summary:
      'Create an org agent config from a platform template (persona + tools + hooks). Same template may be used multiple times.',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  @ApiConflictError('Slug already exists')
  createAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: AssignAgentDto,
  ) {
    return this.organizationAgentsService.assign(orgIdFrom(principal), dto);
  }

  @Post('users/agents/:id/clone')
  @ApiOperation({
    summary:
      'Clone an organization agent config with a new name/slug (copies prompt, hooks, tools, task)',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Agent not found')
  @ApiConflictError('Slug already exists')
  cloneAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
    @Body() dto: CloneOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.clone(
      orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Get('users/agents/:id')
  @ApiOperation({
    summary: 'Get one organization agent for the current user organization',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Agent not found')
  getAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
  ) {
    return this.organizationAgentsService.getOne(orgIdFrom(principal), id);
  }

  @Patch('users/agents/:id')
  @ApiOperation({
    summary:
      'Update organization agent config (name/slug, persona, tools, task, voice/speed/delivery). Org id comes from the JWT.',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiNotFoundError('Agent not found')
  @ApiConflictError('Slug already exists')
  updateAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
    @Body() dto: UpdateOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.update(
      orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete('users/agents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete an organization agent config (blocked if referenced by integrations / dispatch rules)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('Agent not found')
  @ApiConflictError('Agent is referenced by integrations or dispatch rules')
  async removeAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Agent')) id: string,
  ): Promise<void> {
    await this.organizationAgentsService.remove(orgIdFrom(principal), id);
  }
}

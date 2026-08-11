import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AgentsService } from '../agents/agents.service';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { AgentResponseDto } from '../agents/dto/agent-response.dto';
import { AssignAgentDto } from '../agents/dto/assign-agent.dto';
import { CloneOrganizationAgentDto } from '../agents/dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from '../agents/dto/update-organization-agent.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly agentsService: AgentsService,
  ) {}

  // ── Admin: manage org members ──────────────────────────────────────────

  @Post('admin/organizations/:orgId/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Register a user under an organization' })
  @ApiCreatedResponse({ description: 'Created user (no password hash)' })
  async create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    const user = await this.usersService.createForOrganization(orgId, dto);
    return this.usersService.toSafeUser(user);
  }

  @Get('admin/organizations/:orgId/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List users in an organization' })
  @ApiOkResponse({ description: 'Users (no password hashes)' })
  async findAll(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const users = await this.usersService.listByOrganization(orgId);
    return users.map((u) => this.usersService.toSafeUser(u));
  }

  // ── Org user: configure agents for own organization ────────────────────

  @Get('users/agent-templates')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary:
      'List platform agent templates available as starters when creating org agent configs',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  listAgentTemplates() {
    return this.agentsService.listTemplates();
  }

  @Get('users/agents')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary:
      'List agent configs for the current organization (multiple per template allowed)',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  listAgents(@CurrentUser() principal: AuthPrincipal) {
    return this.organizationAgentsService.listByOrganization(
      this.orgIdFrom(principal),
    );
  }

  @Post('users/agents')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary:
      'Create an org agent config from a platform template (persona + tools + hooks). Same template may be used multiple times.',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  createAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: AssignAgentDto,
  ) {
    return this.organizationAgentsService.assign(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Post('users/agents/:id/clone')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary:
      'Clone an organization agent config with a new name/slug (copies prompt, hooks, tools, task)',
  })
  @ApiCreatedResponse({ type: AgentResponseDto })
  cloneAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.clone(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Get('users/agents/:id')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary: 'Get one organization agent for the current user organization',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  getAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.organizationAgentsService.getOne(this.orgIdFrom(principal), id);
  }

  @Patch('users/agents/:id')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({
    summary:
      'Update organization agent config (name/slug, persona, tools, task). Org id comes from the JWT.',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  updateAgent(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationAgentDto,
  ) {
    return this.organizationAgentsService.update(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

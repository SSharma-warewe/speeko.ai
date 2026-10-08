import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthOrgUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import {
  ActiveHumanCallResponseDto,
  CreateHumanCallDto,
  HumanCallResponseDto,
} from './dto/human-call.dto';
import { HumanCallsService } from './services/human-calls.service';
import { HumanCallWorkspaceService } from './services/human-call-workspace.service';
import { UpdateHumanCallWorkspaceDto, HumanCallWorkspaceActionDto, ResolveHumanCallActionDto } from './dto/human-call-workspace.dto';

@Controller('users/calls')
@ApiTags('user-calls')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
export class UserHumanCallsController {
  constructor(private readonly human: HumanCallsService, private readonly workspace: HumanCallWorkspaceService) {}
  @Get(':id/human/workspace')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read your call tools and saved wrap-up results' })
  @ApiOkResponse({ description: 'Human call workspace, without join credentials' })
  @ApiNotFoundError('Human call not found')
  getWorkspace(@CurrentUser() actor: AuthOrgUser, @Param('id', ParseResourceIdPipe('Call')) id: string) {
    return this.workspace.get(actor, id);
  }
  @Patch(':id/human/workspace')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save interest or notes with an optimistic revision' })
  @ApiOkResponse({ description: 'Updated workspace' })
  @ApiConflictResponse({ description: 'Workspace revision changed' })
  updateWorkspace(@CurrentUser() actor: AuthOrgUser, @Param('id', ParseResourceIdPipe('Call')) id: string,
    @Body() body: UpdateHumanCallWorkspaceDto) {
    return this.workspace.update(actor, id, body);
  }
  @Post(':id/human/workspace/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Book a meeting or copy saved call results to CRM, without automatic retries' })
  @ApiOkResponse({ description: 'Workspace with durable external action receipt' })
  @ApiConflictResponse({ description: 'Revision conflict or unresolved external action' })
  workspaceAction(@CurrentUser() actor: AuthOrgUser, @Param('id', ParseResourceIdPipe('Call')) id: string,
    @Body() body: HumanCallWorkspaceActionDto) {
    return this.workspace.execute(actor, id, body);
  }
  @Post(':id/human/workspace/actions/:requestId/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reconcile an uncertain CRM action after manual inspection, without resending it' })
  @ApiOkResponse({ description: 'Updated action journal' })
  resolveAction(@CurrentUser() actor: AuthOrgUser, @Param('id', ParseResourceIdPipe('Call')) id: string,
    @Param('requestId', ParseResourceIdPipe('Action')) requestId: string, @Body() body: ResolveHumanCallActionDto) {
    return this.workspace.resolve(actor, id, requestId, body.resolution, body.providerId);
  }
  @Get('human/active')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get human calling availability and your active call',
  })
  @ApiOkResponse({ type: ActiveHumanCallResponseDto })
  active(@CurrentUser() actor: AuthOrgUser) {
    return this.human.active(actor);
  }
  @Post('human')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Prepare a browser call to a CRM contact without AI dispatch',
  })
  @ApiCreatedResponse({ type: HumanCallResponseDto })
  @ApiConflictResponse({
    description: 'Request replay conflict or another active call',
  })
  create(@CurrentUser() actor: AuthOrgUser, @Body() body: CreateHumanCallDto) {
    return this.human.create(actor, body);
  }
  @Post(':id/human/join')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Issue ephemeral microphone-only browser credentials to the initiating user',
  })
  @ApiOkResponse({ type: HumanCallResponseDto })
  @ApiNotFoundError('Human call not found')
  join(
    @CurrentUser() actor: AuthOrgUser,
    @Param('id', ParseResourceIdPipe('Call')) id: string,
  ) {
    return this.human.join(actor, id);
  }
  @Post(':id/human/end')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Request idempotent termination of your human call',
  })
  @ApiOkResponse({ type: HumanCallResponseDto })
  @ApiNotFoundError('Human call not found')
  end(
    @CurrentUser() actor: AuthOrgUser,
    @Param('id', ParseResourceIdPipe('Call')) id: string,
  ) {
    return this.human.end(actor, id);
  }
}

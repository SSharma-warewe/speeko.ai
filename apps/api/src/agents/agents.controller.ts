import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { AgentResponseDto } from './dto/agent-response.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('agents')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List platform agent templates (inbound, outbound, …)',
  })
  @ApiOkResponse({ type: [AgentResponseDto] })
  list() {
    return this.agentsService.listTemplates();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a platform agent template (persona + tool profile defaults)',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentsService.getTemplate(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update platform agent template defaults (persona prompt, tool profile, task, voice/model). Existing org assignments are not retro-updated.',
  })
  @ApiOkResponse({ type: AgentResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(id, dto);
  }
}

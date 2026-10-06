import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { orgIdFrom } from '../auth/org-id';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import { RECEPTIONIST_INSTRUCTION } from './receptionist-instruction';
import {
  UpdateWhatsAppAgentDto,
  WhatsAppAgentConfigDto,
} from './dto/whatsapp-agent-config.dto';

@ApiTags('user-whatsapp-agent')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp/agent')
export class WhatsAppAgentController {
  constructor(private readonly integrations: OrganizationIntegrationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get the org WhatsApp channel persona, task and booking configuration',
    description:
      'Returns the channel persona, selected task and booking sources. A missing task or empty persona pauses org auto-replies. The platform prompt is a read-only example.',
  })
  @ApiOkResponse({ type: WhatsAppAgentConfigDto })
  async get(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppAgentConfigDto> {
    const config = await this.integrations.getWhatsAppAgent(
      orgIdFrom(principal),
    );
    return { ...config, platformPrompt: RECEPTIONIST_INSTRUCTION };
  }

  @Patch()
  @ApiOperation({
    summary:
      'Update the org WhatsApp channel persona, task and booking configuration',
    description:
      'Empty persona or null task disables org auto-replies. Selected tasks require assigned GHL booking/free-slot/contact tools and an active calendar source. Configuration is snapshotted for new sessions.',
  })
  @ApiOkResponse({ type: WhatsAppAgentConfigDto })
  @ApiNotFoundError('No active WhatsApp connection')
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateWhatsAppAgentDto,
  ): Promise<WhatsAppAgentConfigDto> {
    const config = await this.integrations.updateWhatsAppAgent(
      orgIdFrom(principal),
      dto.systemPrompt,
      dto.bookingVoiceAgentId,
      dto.whatsappToolProfileId,
      dto.taskKey,
      dto.whatsappTaskId,
      dto.taskContext,
    );
    return { ...config, platformPrompt: RECEPTIONIST_INSTRUCTION };
  }
}

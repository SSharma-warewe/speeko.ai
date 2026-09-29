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
  constructor(
    private readonly integrations: OrganizationIntegrationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the org WhatsApp inbound agent system prompt',
    description:
      'Requires an active WhatsApp connection. Null prompt means auto-replies are off.',
  })
  @ApiOkResponse({ type: WhatsAppAgentConfigDto })
  @ApiNotFoundError('No active WhatsApp connection')
  get(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppAgentConfigDto> {
    return this.integrations.getWhatsAppAgent(orgIdFrom(principal));
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the org WhatsApp inbound agent system prompt',
    description:
      'Empty string clears the prompt and disables auto-replies for this org line.',
  })
  @ApiOkResponse({ type: WhatsAppAgentConfigDto })
  @ApiNotFoundError('No active WhatsApp connection')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateWhatsAppAgentDto,
  ): Promise<WhatsAppAgentConfigDto> {
    return this.integrations.updateWhatsAppAgent(
      orgIdFrom(principal),
      dto.systemPrompt,
    );
  }
}

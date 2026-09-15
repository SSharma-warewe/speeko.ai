import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { GenerateWhatsAppWebhookConfigDto } from './dto/generate-whatsapp-webhook-config.dto';
import {
  WhatsAppWebhookConfigResponseDto,
  WhatsAppWebhookConfigSecretResponseDto,
} from './dto/whatsapp-webhook-config-response.dto';
import { WhatsAppWebhooksService } from './whatsapp-webhooks.service';

@ApiTags('user-whatsapp-webhooks')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp/webhook-config')
export class UserWhatsAppWebhooksController {
  constructor(private readonly whatsappWebhooks: WhatsAppWebhooksService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the WhatsApp webhook configuration for the caller organization',
    description:
      'Returns the callback URL and verify-token prefix. The raw verify token is never returned here — generate again to rotate.',
  })
  @ApiOkResponse({ type: WhatsAppWebhookConfigResponseDto })
  @ApiNotFoundError('WhatsApp webhook configuration not found')
  get(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppWebhookConfigResponseDto> {
    return this.whatsappWebhooks.getConfigForOrg(orgIdFrom(principal));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate or rotate a WhatsApp webhook configuration',
    description:
      'Creates or replaces the org verify token and stores phone_number_id / WABA id for inbound routing. ' +
      'Returns the raw verify token once — paste it into the Meta App Dashboard with the callback URL.',
  })
  @ApiOkResponse({ type: WhatsAppWebhookConfigSecretResponseDto })
  @ApiConflictError('Phone number id or WABA id already configured on another org')
  generate(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: GenerateWhatsAppWebhookConfigDto,
  ): Promise<WhatsAppWebhookConfigSecretResponseDto> {
    return this.whatsappWebhooks.generateConfigForOrg(orgIdFrom(principal), dto);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { ApiJwtErrors } from '../common/swagger/api-errors';
import { WhatsAppWebhookEventResponseDto } from './dto/whatsapp-webhook-event-response.dto';
import { WhatsAppWebhooksService } from './whatsapp-webhooks.service';

@ApiTags('user-whatsapp-webhooks')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp/webhook-events')
export class UserWhatsAppWebhookEventsController {
  constructor(private readonly whatsappWebhooks: WhatsAppWebhooksService) {}

  @Get()
  @ApiOperation({
    summary: 'List recent WhatsApp webhook posts for the caller organization',
    description:
      'Returns the latest 50 posts for this org, plus posts that did not match any phone number id or WABA id. Other organizations are omitted. No message replies.',
  })
  @ApiOkResponse({ type: WhatsAppWebhookEventResponseDto, isArray: true })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppWebhookEventResponseDto[]> {
    return this.whatsappWebhooks.listEventsForOrg(orgIdFrom(principal));
  }
}

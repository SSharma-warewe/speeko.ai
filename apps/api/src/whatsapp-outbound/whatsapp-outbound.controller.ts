import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { orgIdFrom } from '../auth/org-id';
import {
  ApiBadGatewayError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { SendWhatsAppTemplateDto } from './dto/send-whatsapp-template.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import {
  GhlContactsResponseDto,
  SendWhatsAppTemplateResponseDto,
  WhatsAppOutboundMessageDto,
  WhatsAppTemplatesResponseDto,
} from './dto/whatsapp-outbound-response.dto';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';

@ApiTags('user-whatsapp-outbound')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp/outbound')
export class WhatsAppOutboundController {
  constructor(private readonly outbound: WhatsAppOutboundService) {}

  @Get('templates')
  @ApiOperation({
    summary: 'List message templates from Meta for the org WhatsApp connection',
    description:
      'Fetched live from the WABA (`GET /{waba_id}/message_templates`). Approved, supported templates have `sendable: true`.',
  })
  @ApiOkResponse({ type: WhatsAppTemplatesResponseDto })
  @ApiNotFoundError('No active WhatsApp connection')
  @ApiBadGatewayError('Meta rejected the request')
  templates(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppTemplatesResponseDto> {
    return this.outbound.listTemplates(orgIdFrom(principal));
  }

  @Get('contacts')
  @ApiOperation({
    summary: 'List GoHighLevel contacts (live, paged)',
    description:
      'Uses the org ghl_contacts connection, or the selected org ghl_crm connection via integrationId. Pass nextCursor as cursor for the next page.',
  })
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'integrationId', required: false })
  @ApiOkResponse({ type: GhlContactsResponseDto })
  @ApiNotFoundError('No active GoHighLevel contacts connection')
  @ApiBadGatewayError('GoHighLevel rejected the request')
  contacts(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: ListContactsQueryDto,
  ): Promise<GhlContactsResponseDto> {
    return this.outbound.listContacts(
      orgIdFrom(principal),
      query.query,
      query.cursor,
      query.integrationId,
    );
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send an approved template to selected contacts',
    description:
      'Sends from the org WhatsApp connection (token + phone number id). 1–50 recipients per request; Do Not Disturb, invalid, duplicate, or incomplete contacts are skipped with a reason. Returns a per-recipient result.',
  })
  @ApiOkResponse({ type: SendWhatsAppTemplateResponseDto })
  @ApiNotFoundError('No active WhatsApp connection')
  @ApiBadGatewayError('Meta rejected the template list request')
  send(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: SendWhatsAppTemplateDto,
  ): Promise<SendWhatsAppTemplateResponseDto> {
    return this.outbound.send(orgIdFrom(principal), dto);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Latest outbound template sends for the org' })
  @ApiOkResponse({ type: WhatsAppOutboundMessageDto, isArray: true })
  messages(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<WhatsAppOutboundMessageDto[]> {
    return this.outbound.listMessages(orgIdFrom(principal));
  }
}

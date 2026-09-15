import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ApiBadRequestError } from '../common/swagger/api-errors';
import { WhatsAppWebhookAckDto } from './dto/whatsapp-webhook-ack.dto';
import { parseWhatsAppHubRequest } from './lib/parse-whatsapp-hub-query';
import { WhatsAppWebhooksService } from './whatsapp-webhooks.service';

/**
 * Public Meta webhook. Do not add JwtAuthGuard / UserGuard — Meta's GET
 * verification and POST ingest have no org JWT.
 */
@ApiTags('whatsapp-webhooks')
@Controller('webhooks/whatsapp')
export class PublicWhatsAppWebhooksController {
  constructor(private readonly whatsappWebhooks: WhatsAppWebhooksService) {}

  @Get()
  @ApiProduces('text/plain')
  @ApiOperation({
    summary: 'Meta WhatsApp webhook verification',
    description:
      'Responds with hub.challenge as plain text when hub.mode is subscribe and hub.verify_token matches an active org config. No JWT.',
  })
  @ApiQuery({ name: 'hub.mode', required: true, example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true, example: '1158201444' })
  @ApiOkResponse({
    description: 'hub.challenge echoed as text/plain',
    schema: { type: 'string', example: '1158201444' },
  })
  @ApiForbiddenResponse({
    description: 'Verification failed',
    type: ErrorResponseDto,
  })
  async verify(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { mode, token, challenge } = parseWhatsAppHubRequest(req);
    const echoed = await this.whatsappWebhooks.verifySubscription(
      mode,
      token,
      challenge,
    );
    // Meta compares the raw body to hub.challenge. Do not JSON-encode.
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/plain');
    res.end(echoed);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive a WhatsApp webhook payload from Meta',
    description:
      'Persists the raw JSON body and returns 200 immediately. Does not send replies or process messages.',
  })
  @ApiBody({
    description: 'Meta WhatsApp webhook JSON (up to 3 MB)',
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiOkResponse({ type: WhatsAppWebhookAckDto })
  @ApiBadRequestError('Invalid webhook payload')
  ingest(@Body() payload: unknown): Promise<WhatsAppWebhookAckDto> {
    return this.whatsappWebhooks.ingestWebhook(payload);
  }
}

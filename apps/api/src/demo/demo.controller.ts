import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip';
import { DemoService } from './demo.service';
import { RequestDemoDto } from './dto/request-demo.dto';
import { RequestDemoResponseDto } from './dto/request-demo-response.dto';
import { DemoAbuseGuard } from './guards/demo-abuse.guard';

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('request')
  @UseGuards(DemoAbuseGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a product demo call',
    description:
      'Public marketing form. Origin allowlist (when CORS_ORIGIN is set) + in-process ' +
      'rate limits, then best-effort GoHighLevel upsert and proxy to ENDPOINT_URL with ' +
      'SPEEKO_API (integration enqueue). Agent, task, and trunk are fixed on that ' +
      'endpoint. Creates a pending outbound call; the queue dialer places the SIP leg. ' +
      'CRM failure does not fail the request.',
  })
  @ApiOkResponse({ type: RequestDemoResponseDto })
  @ApiForbiddenResponse({
    description: 'Origin not allowed (when CORS_ORIGIN is set)',
  })
  @ApiTooManyRequestsResponse({
    description: 'Per-IP, per-phone, per-email, or global demo rate limit',
  })
  @ApiServiceUnavailableResponse({
    description: 'ENDPOINT_URL or SPEEKO_API not set',
  })
  @ApiBadGatewayResponse({
    description: 'Integration enqueue failed',
  })
  request(
    @Body() dto: RequestDemoDto,
    @Req() req: Request,
  ): Promise<RequestDemoResponseDto> {
    return this.demoService.requestDemo(dto, clientIp(req));
  }
}

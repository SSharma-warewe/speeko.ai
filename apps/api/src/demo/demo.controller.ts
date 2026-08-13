import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DemoService } from './demo.service';
import { RequestDemoDto } from './dto/request-demo.dto';
import { RequestDemoResponseDto } from './dto/request-demo-response.dto';

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a product demo call',
    description:
      'Public marketing form. Best-effort upsert of a GoHighLevel contact, then ' +
      'proxies to ENDPOINT_URL with SPEEKO_API (integration enqueue). Agent, task, ' +
      'and trunk are fixed on that endpoint. Creates a pending outbound call; the ' +
      'queue dialer places the SIP leg. CRM failure does not fail the request.',
  })
  @ApiOkResponse({ type: RequestDemoResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'ENDPOINT_URL or SPEEKO_API not set',
  })
  @ApiBadGatewayResponse({
    description: 'Integration enqueue failed',
  })
  request(@Body() dto: RequestDemoDto): Promise<RequestDemoResponseDto> {
    return this.demoService.requestDemo(dto);
  }
}

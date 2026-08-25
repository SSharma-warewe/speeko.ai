import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiIntegrationErrors } from '../common/swagger/api-errors';
import { PublicEnqueueCallDto } from './dto/public-enqueue-call.dto';
import { PublicEnqueueResponseDto } from './dto/public-enqueue-response.dto';
import { IntegrationEndpointsService } from './integration-endpoints.service';

@ApiTags('integrations')
@ApiSecurity('integrationApiKey')
@ApiIntegrationErrors()
@Controller('integrations')
export class PublicIntegrationsController {
  constructor(
    private readonly integrationEndpointsService: IntegrationEndpointsService,
  ) {}

  @Post(':publicId/calls')
  @ApiOperation({
    summary: 'Enqueue one outbound call via integration API key',
    description:
      'Thin CRM request: phoneNumber + optional context + optional externalId. ' +
      'Agent, task, trunk, and queue config are fixed on the integration endpoint. ' +
      'Auth: Authorization: Bearer <apiKey> or X-Api-Key: <apiKey>. ' +
      'Creates a pending call batch; the API queue dialer places the SIP call.',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    required: false,
    description: 'API key (alternative to Authorization: Bearer)',
  })
  @ApiCreatedResponse({ type: PublicEnqueueResponseDto })
  enqueue(
    @Param('publicId') publicId: string,
    @Body() dto: PublicEnqueueCallDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-api-key') xApiKey?: string,
  ): Promise<PublicEnqueueResponseDto> {
    const apiKey = this.extractApiKey(authorization, xApiKey);
    return this.integrationEndpointsService.enqueuePublicCall(
      publicId,
      apiKey,
      dto,
    );
  }

  private extractApiKey(
    authorization?: string,
    xApiKey?: string,
  ): string | undefined {
    if (xApiKey?.trim()) {
      return xApiKey.trim();
    }
    if (!authorization?.trim()) {
      return undefined;
    }
    const value = authorization.trim();
    const match = /^Bearer\s+(.+)$/i.exec(value);
    return match?.[1]?.trim() || value;
  }
}

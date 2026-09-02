import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { orgIdFrom } from '../auth/org-id';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import { CreateIntegrationEndpointDto } from './dto/create-integration-endpoint.dto';
import {
  IntegrationEndpointResponseDto,
  IntegrationEndpointSecretResponseDto,
} from './dto/integration-endpoint-response.dto';
import { UpdateIntegrationEndpointDto } from './dto/update-integration-endpoint.dto';
import { IntegrationEndpointsService } from './integration-endpoints.service';

@ApiTags('user-integration-endpoints')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/integration-endpoints')
export class UserIntegrationEndpointsController {
  constructor(
    private readonly integrationEndpointsService: IntegrationEndpointsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List integration endpoints for the caller organization',
    description:
      'Preconfigured CRM dial-in endpoints. API secrets are never returned on list.',
  })
  @ApiOkResponse({ type: [IntegrationEndpointResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<IntegrationEndpointResponseDto[]> {
    return this.integrationEndpointsService.listForOrg(
      orgIdFrom(principal),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create an integration endpoint + API key',
    description:
      'Binds agent, task, trunk, and queue overrides on the platform. ' +
      'Returns the full API key once — store it securely; it cannot be retrieved later.',
  })
  @ApiCreatedResponse({ type: IntegrationEndpointSecretResponseDto })
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateIntegrationEndpointDto,
  ): Promise<IntegrationEndpointSecretResponseDto> {
    const userId = principal.typ === 'user' ? principal.id : null;
    return this.integrationEndpointsService.createForOrg(
      orgIdFrom(principal),
      dto,
      userId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one integration endpoint (no secret)' })
  @ApiOkResponse({ type: IntegrationEndpointResponseDto })
  @ApiNotFoundError('Integration not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<IntegrationEndpointResponseDto> {
    return this.integrationEndpointsService.getOneForOrg(
      orgIdFrom(principal),
      id,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update endpoint config (agent, task, queue, default context, active)',
  })
  @ApiOkResponse({ type: IntegrationEndpointResponseDto })
  @ApiNotFoundError('Integration not found')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
    @Body() dto: UpdateIntegrationEndpointDto,
  ): Promise<IntegrationEndpointResponseDto> {
    return this.integrationEndpointsService.updateForOrg(
      orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Post(':id/rotate-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate API key (returns new key once; invalidates the old key)',
  })
  @ApiOkResponse({ type: IntegrationEndpointSecretResponseDto })
  @ApiNotFoundError('Integration not found')
  rotateKey(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<IntegrationEndpointSecretResponseDto> {
    return this.integrationEndpointsService.rotateKeyForOrg(
      orgIdFrom(principal),
      id,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete integration endpoint (revokes access)' })
  @ApiNoContentResponse()
  @ApiNotFoundError('Integration not found')
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<void> {
    await this.integrationEndpointsService.deleteForOrg(
      orgIdFrom(principal),
      id,
    );
  }

}

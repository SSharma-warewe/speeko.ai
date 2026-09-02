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
import { CreateOrganizationIntegrationDto } from './dto/create-organization-integration.dto';
import {
  OrganizationIntegrationResponseDto,
  OrganizationIntegrationTestResponseDto,
  PreviewGhlCalendarsResponseDto,
} from './dto/organization-integration-response.dto';
import { PreviewGhlCalendarsDto } from './dto/preview-ghl-calendars.dto';
import { UpdateOrganizationIntegrationDto } from './dto/update-organization-integration.dto';
import { OrganizationIntegrationsService } from './organization-integrations.service';

@ApiTags('user-integrations')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/integrations')
export class UserOrganizationIntegrationsController {
  constructor(
    private readonly organizationIntegrationsService: OrganizationIntegrationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List third-party integrations for the caller organization',
    description:
      'Nylas and GoHighLevel calendar connections. API keys are never returned.',
  })
  @ApiOkResponse({ type: [OrganizationIntegrationResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrganizationIntegrationResponseDto[]> {
    return this.organizationIntegrationsService.listForOrg(
      orgIdFrom(principal),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Add a Nylas or GoHighLevel calendar integration',
    description:
      'Store org-owned credentials (Nylas key+grant or GHL PIT+location+calendar). The full API key is accepted only on create/update and never returned on GET.',
  })
  @ApiCreatedResponse({ type: OrganizationIntegrationResponseDto })
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateOrganizationIntegrationDto,
  ): Promise<OrganizationIntegrationResponseDto> {
    const userId = principal.typ === 'user' ? principal.id : null;
    return this.organizationIntegrationsService.createForOrg(
      orgIdFrom(principal),
      dto,
      userId,
    );
  }

  @Post('ghl/calendars')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List GoHighLevel calendars for a v3 PIT + location',
    description:
      'Does not save. Calls GET /calendars/?locationId= with Version 2021-07-28. ' +
      'Token needs calendars.readonly. Use the ids to fill calendarId on create.',
  })
  @ApiOkResponse({ type: PreviewGhlCalendarsResponseDto })
  previewGhlCalendars(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: PreviewGhlCalendarsDto,
  ): Promise<PreviewGhlCalendarsResponseDto> {
    return this.organizationIntegrationsService.previewGhlCalendars(
      orgIdFrom(principal),
      dto,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one integration (no secret)' })
  @ApiOkResponse({ type: OrganizationIntegrationResponseDto })
  @ApiNotFoundError('Integration not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<OrganizationIntegrationResponseDto> {
    return this.organizationIntegrationsService.getOneForOrg(
      orgIdFrom(principal),
      id,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update integration fields (optional new API key)' })
  @ApiOkResponse({ type: OrganizationIntegrationResponseDto })
  @ApiNotFoundError('Integration not found')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
    @Body() dto: UpdateOrganizationIntegrationDto,
  ): Promise<OrganizationIntegrationResponseDto> {
    return this.organizationIntegrationsService.updateForOrg(
      orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete integration',
    description:
      'Agents linked via calendar_integration_id are set to null (FK SET NULL).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('Integration not found')
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<void> {
    await this.organizationIntegrationsService.removeForOrg(
      orgIdFrom(principal),
      id,
    );
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Smoke-test Nylas or GoHighLevel credentials (list calendars)',
  })
  @ApiOkResponse({ type: OrganizationIntegrationTestResponseDto })
  @ApiNotFoundError('Integration not found')
  test(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Integration')) id: string,
  ): Promise<OrganizationIntegrationTestResponseDto> {
    return this.organizationIntegrationsService.testConnection(
      orgIdFrom(principal),
      id,
    );
  }

}

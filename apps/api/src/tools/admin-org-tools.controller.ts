import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import { KnownToolsResponseDto } from './dto/known-tools-response.dto';
import { UpdateOrganizationToolsDto } from './dto/update-organization-tools.dto';
import { ToolProfilesService } from './tool-profiles.service';

@ApiTags('admin-org-tools')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/tools')
export class AdminOrgToolsController {
  constructor(private readonly toolProfilesService: ToolProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'List worker tools assigned to this organization',
    description:
      'Allowlist of worker registry ids the org may put on tool profiles. null (pre-allowlist tenants) returns the full registry so existing orgs keep their tools. New orgs store endCall only.',
  })
  @ApiOkResponse({ type: KnownToolsResponseDto })
  @ApiNotFoundError('Organization not found')
  async list(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<KnownToolsResponseDto> {
    return {
      toolIds: await this.toolProfilesService.listAssignedToolIds(orgId),
    };
  }

  @Patch()
  @ApiOperation({
    summary: 'Replace worker tools assigned to this organization',
    description:
      'Unknown ids rejected. endCall is always included. Runtime enabledTools for this org is intersected with this set.',
  })
  @ApiOkResponse({ type: KnownToolsResponseDto })
  @ApiNotFoundError('Organization not found')
  async replace(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Body() dto: UpdateOrganizationToolsDto,
  ): Promise<KnownToolsResponseDto> {
    return {
      toolIds: await this.toolProfilesService.replaceAssignedToolIds(
        orgId,
        dto.toolIds,
      ),
    };
  }
}

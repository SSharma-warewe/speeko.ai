import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
import { ToolProfileResponseDto } from './dto/tool-profile-response.dto';
import { ToolProfilesService } from './tool-profiles.service';

@ApiTags('admin-org-tool-profiles')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/organizations/:orgId/tool-profiles')
export class AdminOrgToolProfilesController {
  constructor(private readonly toolProfilesService: ToolProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'List tool profiles visible when configuring an org',
    description:
      'Platform catalog + custom profiles owned by the organization (for agent assign).',
  })
  @ApiOkResponse({ type: [ToolProfileResponseDto] })
  @ApiNotFoundError('Organization not found')
  list(@Param('orgId', ParseResourceIdPipe('Organization')) orgId: string) {
    return this.toolProfilesService.listForOrganization(orgId);
  }
}

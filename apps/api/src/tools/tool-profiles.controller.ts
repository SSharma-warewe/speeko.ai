import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateToolProfileDto } from './dto/create-tool-profile.dto';
import { ToolProfileResponseDto } from './dto/tool-profile-response.dto';
import { UpdateToolProfileDto } from './dto/update-tool-profile.dto';
import { ToolProfilesService } from './tool-profiles.service';

@ApiTags('tool-profiles')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/tool-profiles')
export class ToolProfilesController {
  constructor(private readonly toolProfilesService: ToolProfilesService) {}

  @Get()
  @ApiOperation({
    summary: 'List platform tool profiles (capability bundles)',
    description:
      'Platform catalog only (organization_id null). For org-owned customs use GET /admin/organizations/:orgId/tool-profiles.',
  })
  @ApiOkResponse({ type: [ToolProfileResponseDto] })
  list() {
    return this.toolProfilesService.listPlatformResponses();
  }

  @Get('known-tools')
  @ApiOperation({ summary: 'List known worker tool ids' })
  knownTools() {
    return { toolIds: this.toolProfilesService.knownToolIds() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tool profile by id' })
  @ApiOkResponse({ type: ToolProfileResponseDto })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.toolProfilesService.getResponse(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a platform tool profile',
    description:
      'Adds a catalog capability bundle (organization_id null). endCall is always included. Orgs can select these when assigning agents.',
  })
  @ApiCreatedResponse({ type: ToolProfileResponseDto })
  create(@Body() dto: CreateToolProfileDto) {
    return this.toolProfilesService.createForPlatform(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a platform tool profile',
    description: 'Org-owned profiles cannot be edited here.',
  })
  @ApiOkResponse({ type: ToolProfileResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateToolProfileDto,
  ) {
    return this.toolProfilesService.updateForPlatform(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a platform tool profile',
    description:
      'Fails if organization agents or platform agent templates still reference it.',
  })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.toolProfilesService.removeForPlatform(id);
  }
}

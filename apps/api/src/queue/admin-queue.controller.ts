import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import {
  AdminQueueStatsResponseDto,
  OrgQueueStatsResponseDto,
} from './dto/queue-stats-response.dto';
import { QueueSettingsResponseDto } from './dto/queue-settings-response.dto';
import { UpdateQueueSettingsDto } from './dto/update-queue-settings.dto';
import { toQueueSettingsResponse } from './mappers/queue-settings.mapper';
import { OrganizationQueueSettingsService } from './organization-queue-settings.service';
import { QueueStatsService } from './queue-stats.service';

@ApiTags('admin-queue')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminQueueController {
  constructor(
    private readonly settingsService: OrganizationQueueSettingsService,
    private readonly statsService: QueueStatsService,
  ) {}

  @Get('queue/stats')
  @ApiOperation({
    summary: 'Platform-wide queue stats + per-org breakdown',
  })
  @ApiOkResponse({ type: AdminQueueStatsResponseDto })
  platformStats(): Promise<AdminQueueStatsResponseDto> {
    return this.statsService.adminSummary();
  }

  @Get('organizations/:orgId/queue/settings')
  @ApiOperation({ summary: 'Get queue settings for an organization' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  @ApiNotFoundError('Organization not found')
  async getSettings(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.getOrCreate(orgId);
    return toQueueSettingsResponse(settings);
  }

  @Patch('organizations/:orgId/queue/settings')
  @ApiOperation({ summary: 'Update queue settings for an organization' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  @ApiNotFoundError('Organization not found')
  async updateSettings(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Body() dto: UpdateQueueSettingsDto,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.update(orgId, dto);
    return toQueueSettingsResponse(settings);
  }

  @Post('organizations/:orgId/queue/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force-pause org queue' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  @ApiNotFoundError('Organization not found')
  async pause(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(orgId, true);
    return toQueueSettingsResponse(settings);
  }

  @Post('organizations/:orgId/queue/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume org queue' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  @ApiNotFoundError('Organization not found')
  async resume(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(orgId, false);
    return toQueueSettingsResponse(settings);
  }

  @Get('organizations/:orgId/queue/stats')
  @ApiOperation({ summary: 'Live queue stats for one organization' })
  @ApiOkResponse({ type: OrgQueueStatsResponseDto })
  @ApiNotFoundError('Organization not found')
  orgStats(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ): Promise<OrgQueueStatsResponseDto> {
    return this.statsService.forOrganization(orgId);
  }
}

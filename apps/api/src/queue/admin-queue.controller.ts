import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  async getSettings(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.getOrCreate(orgId);
    return toQueueSettingsResponse(settings);
  }

  @Patch('organizations/:orgId/queue/settings')
  @ApiOperation({ summary: 'Update queue settings for an organization' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async updateSettings(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpdateQueueSettingsDto,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.update(orgId, dto);
    return toQueueSettingsResponse(settings);
  }

  @Post('organizations/:orgId/queue/pause')
  @ApiOperation({ summary: 'Force-pause org queue' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async pause(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(orgId, true);
    return toQueueSettingsResponse(settings);
  }

  @Post('organizations/:orgId/queue/resume')
  @ApiOperation({ summary: 'Resume org queue' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async resume(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(orgId, false);
    return toQueueSettingsResponse(settings);
  }

  @Get('organizations/:orgId/queue/stats')
  @ApiOperation({ summary: 'Live queue stats for one organization' })
  @ApiOkResponse({ type: OrgQueueStatsResponseDto })
  orgStats(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<OrgQueueStatsResponseDto> {
    return this.statsService.forOrganization(orgId);
  }
}

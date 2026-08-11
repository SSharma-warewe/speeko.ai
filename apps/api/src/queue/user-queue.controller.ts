import {
  Body,
  Controller,
  ForbiddenException,
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
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { CallBatchesService } from './call-batches.service';
import { CallBatchResponseDto } from './dto/call-batch-response.dto';
import { OrgQueueStatsResponseDto } from './dto/queue-stats-response.dto';
import { QueueSettingsResponseDto } from './dto/queue-settings-response.dto';
import { UpdateQueueSettingsDto } from './dto/update-queue-settings.dto';
import { toQueueSettingsResponse } from './mappers/queue-settings.mapper';
import { OrganizationQueueSettingsService } from './organization-queue-settings.service';
import { QueueStatsService } from './queue-stats.service';

@ApiTags('user-queue')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/queue')
export class UserQueueController {
  constructor(
    private readonly settingsService: OrganizationQueueSettingsService,
    private readonly batchesService: CallBatchesService,
    private readonly statsService: QueueStatsService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get organization outbound queue settings' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async getSettings(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.getOrCreate(
      this.orgIdFrom(principal),
    );
    return toQueueSettingsResponse(settings);
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Update organization queue settings',
  })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async updateSettings(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateQueueSettingsDto,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.update(
      this.orgIdFrom(principal),
      dto,
    );
    return toQueueSettingsResponse(settings);
  }

  @Post('pause')
  @ApiOperation({ summary: 'Pause org queue — no new dials' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async pause(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(
      this.orgIdFrom(principal),
      true,
    );
    return toQueueSettingsResponse(settings);
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume org queue' })
  @ApiOkResponse({ type: QueueSettingsResponseDto })
  async resume(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<QueueSettingsResponseDto> {
    const settings = await this.settingsService.setPaused(
      this.orgIdFrom(principal),
      false,
    );
    return toQueueSettingsResponse(settings);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Live org queue stats (poll-friendly)',
    description:
      'Counts by status, concurrency usage, dial rate, batch totals, dialer health.',
  })
  @ApiOkResponse({ type: OrgQueueStatsResponseDto })
  stats(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrgQueueStatsResponseDto> {
    return this.statsService.forOrganization(this.orgIdFrom(principal));
  }

  @Get('batches')
  @ApiOperation({ summary: 'List call batches for the org' })
  @ApiOkResponse({ type: [CallBatchResponseDto] })
  listBatches(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<CallBatchResponseDto[]> {
    return this.batchesService.listForOrg(this.orgIdFrom(principal));
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get batch with per-status call counts' })
  @ApiOkResponse({ type: CallBatchResponseDto })
  getBatch(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallBatchResponseDto> {
    return this.batchesService.getForOrg(this.orgIdFrom(principal), id);
  }

  @Post('batches/:id/pause')
  @ApiOperation({ summary: 'Pause a batch' })
  @ApiOkResponse({ type: CallBatchResponseDto })
  pauseBatch(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallBatchResponseDto> {
    return this.batchesService.pause(this.orgIdFrom(principal), id);
  }

  @Post('batches/:id/resume')
  @ApiOperation({ summary: 'Resume a batch' })
  @ApiOkResponse({ type: CallBatchResponseDto })
  resumeBatch(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallBatchResponseDto> {
    return this.batchesService.resume(this.orgIdFrom(principal), id);
  }

  @Post('batches/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a batch — pending calls become cancelled',
  })
  @ApiOkResponse({ type: CallBatchResponseDto })
  cancelBatch(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallBatchResponseDto> {
    return this.batchesService.cancel(this.orgIdFrom(principal), id);
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import {
  CostRecomputeDto,
  CostRecomputeResponseDto,
  CostSummaryQueryDto,
  CostSummaryResponseDto,
} from './dto/cost-summary.dto';
import { PriceService } from './price.service';

@ApiTags('admin-costs')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/costs')
export class AdminPriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'LiveKit list-price cost totals (no markup)',
    description:
      'Sums persisted call.cost snapshots for personal analysis. Uses published LiveKit overage rates; ignores monthly included credits. Admin only — not tenant billing.',
  })
  @ApiOkResponse({ type: CostSummaryResponseDto })
  summary(
    @Query() query: CostSummaryQueryDto,
  ): Promise<CostSummaryResponseDto> {
    return this.priceService.summary({
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      organizationId: query.organizationId,
    });
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Backfill call cost snapshots from stored usage + timestamps',
    description:
      'Prices historical calls that have usage/endedAt but no cost. Default skips rows that already have a snapshot. Pass replace=true to overwrite (single attempt from current usage; does not invent extra retry attempts).',
  })
  @ApiOkResponse({ type: CostRecomputeResponseDto })
  @ApiNotFoundError('Call not found')
  recompute(
    @Body() dto: CostRecomputeDto,
  ): Promise<CostRecomputeResponseDto> {
    return this.priceService.recompute({
      callId: dto.callId,
      organizationId: dto.organizationId,
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
      replace: dto.replace,
      limit: dto.limit,
    });
  }
}

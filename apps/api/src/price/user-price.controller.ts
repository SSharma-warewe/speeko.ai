import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { orgIdFrom } from '../auth/org-id';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ApiJwtErrors } from '../common/swagger/api-errors';
import {
  CostSummaryResponseDto,
  UserCostSummaryQueryDto,
} from './dto/cost-summary.dto';
import { PriceService } from './price.service';

@ApiTags('user-costs')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/costs')
export class UserPriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'LiveKit list-price cost totals for the caller organization',
    description:
      'Sums persisted call.cost snapshots for this org (JWT orgId). Published LiveKit overage rates, no markup, ignores monthly included credits. Not a tenant invoice. Recompute stays admin-only.',
  })
  @ApiOkResponse({ type: CostSummaryResponseDto })
  summary(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: UserCostSummaryQueryDto,
  ): Promise<CostSummaryResponseDto> {
    return this.priceService.summary({
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      organizationId: orgIdFrom(principal),
    });
  }
}

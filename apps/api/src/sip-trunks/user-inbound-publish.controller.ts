import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ApiJwtErrors } from '../common/swagger/api-errors';
import { SipDispatchRulesService } from '../sip-dispatch-rules/sip-dispatch-rules.service';
import { InboundPublishResultDto } from './dto/inbound-publish-result.dto';
import { PublishInboundDto } from './dto/publish-inbound.dto';
import { SipTrunksService } from './sip-trunks.service';

@ApiTags('user-inbound-publish')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/inbound')
export class UserInboundPublishController {
  constructor(
    private readonly sipTrunksService: SipTrunksService,
    @Inject(forwardRef(() => SipDispatchRulesService))
    private readonly sipDispatchRulesService: SipDispatchRulesService,
  ) {}

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish inbound SIP trunks and dispatch rules to LiveKit',
    description:
      'Publishes trunks first, then dispatch rules. Omit both id lists to publish all drafts for the org. Per-resource outcomes are returned; already-live resources are skipped.',
  })
  @ApiOkResponse({ type: InboundPublishResultDto })
  async publish(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: PublishInboundDto,
  ): Promise<InboundPublishResultDto> {
    const organizationId = this.orgIdFrom(principal);

    const trunkResult = await this.sipTrunksService.publishInboundMany(
      organizationId,
      dto.sipTrunkIds,
    );
    const ruleResult = await this.sipDispatchRulesService.publishMany(
      organizationId,
      dto.dispatchRuleIds,
    );

    return {
      trunks: trunkResult.results,
      dispatchRules: ruleResult.results,
      publishedTrunks: trunkResult.published,
      publishedDispatchRules: ruleResult.published,
    };
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

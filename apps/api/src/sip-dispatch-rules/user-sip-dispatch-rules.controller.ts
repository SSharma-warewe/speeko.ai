import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { CreateSipDispatchRuleDto } from './dto/create-sip-dispatch-rule.dto';
import { SipDispatchRuleResponseDto } from './dto/sip-dispatch-rule-response.dto';
import { UpdateSipDispatchRuleDto } from './dto/update-sip-dispatch-rule.dto';
import { SipDispatchRulesService } from './sip-dispatch-rules.service';

@ApiTags('user-sip-dispatch-rules')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/sip-dispatch-rules')
export class UserSipDispatchRulesController {
  constructor(
    private readonly sipDispatchRulesService: SipDispatchRulesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List SIP dispatch rules for the caller organization' })
  @ApiOkResponse({ type: [SipDispatchRuleResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<SipDispatchRuleResponseDto[]> {
    return this.sipDispatchRulesService.listByOrganization(
      this.orgIdFrom(principal),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one SIP dispatch rule for the caller organization' })
  @ApiOkResponse({ type: SipDispatchRuleResponseDto })
  @ApiNotFoundError('Dispatch rule not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Dispatch rule')) id: string,
  ): Promise<SipDispatchRuleResponseDto> {
    return this.sipDispatchRulesService.getOne(this.orgIdFrom(principal), id);
  }

  @Post()
  @ApiOperation({
    summary: 'Save a SIP dispatch rule draft',
    description:
      'Persists locally only. Call POST /:id/publish or POST /users/inbound/publish to create it on LiveKit.',
  })
  @ApiCreatedResponse({ type: SipDispatchRuleResponseDto })
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateSipDispatchRuleDto,
  ): Promise<SipDispatchRuleResponseDto> {
    return this.sipDispatchRulesService.createDraft(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a local SIP dispatch rule draft/config',
    description: 'Does not auto-sync to LiveKit after publish.',
  })
  @ApiOkResponse({ type: SipDispatchRuleResponseDto })
  @ApiNotFoundError('Dispatch rule not found')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Dispatch rule')) id: string,
    @Body() dto: UpdateSipDispatchRuleDto,
  ): Promise<SipDispatchRuleResponseDto> {
    return this.sipDispatchRulesService.update(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete local SIP dispatch rule row',
    description: 'Local delete only; does not remove the LiveKit dispatch rule.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('Dispatch rule not found')
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Dispatch rule')) id: string,
  ): Promise<void> {
    await this.sipDispatchRulesService.remove(this.orgIdFrom(principal), id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a draft dispatch rule to LiveKit',
    description:
      'Calls CreateSIPDispatchRule. Linked inbound trunks must already be published. Returns 409 if already live.',
  })
  @ApiOkResponse({ type: SipDispatchRuleResponseDto })
  @ApiNotFoundError('Dispatch rule not found')
  @ApiConflictError('Dispatch rule is already live')
  publish(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Dispatch rule')) id: string,
  ): Promise<SipDispatchRuleResponseDto> {
    return this.sipDispatchRulesService.publish(this.orgIdFrom(principal), id);
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

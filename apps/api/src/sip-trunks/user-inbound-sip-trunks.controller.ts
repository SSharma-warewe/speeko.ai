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
import { CreateInboundSipTrunkDto } from './dto/create-inbound-sip-trunk.dto';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { UpdateInboundSipTrunkDto } from './dto/update-inbound-sip-trunk.dto';
import { SipTrunksService } from './sip-trunks.service';

@ApiTags('user-inbound-sip-trunks')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/sip-trunks/inbound')
export class UserInboundSipTrunksController {
  constructor(private readonly sipTrunksService: SipTrunksService) {}

  @Get()
  @ApiOperation({
    summary: 'List inbound SIP trunks for the caller organization',
  })
  @ApiOkResponse({ type: [SipTrunkResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<SipTrunkResponseDto[]> {
    return this.sipTrunksService.listInboundByOrganization(
      this.orgIdFrom(principal),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one inbound SIP trunk (password redacted)' })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.getInboundOne(this.orgIdFrom(principal), id);
  }

  @Post()
  @ApiOperation({
    summary: 'Save an inbound SIP trunk draft',
    description:
      'Persists locally only (unless livekitTrunkId is provided to link). Call POST /:id/publish or POST /users/inbound/publish to create on LiveKit.',
  })
  @ApiCreatedResponse({ type: SipTrunkResponseDto })
  @ApiConflictError('Trunk already exists')
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateInboundSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.createInboundDraft(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update local inbound SIP trunk',
    description: 'Does not auto-sync to LiveKit after publish.',
  })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
    @Body() dto: UpdateInboundSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.updateInbound(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete inbound SIP trunk',
    description:
      'If the trunk is live (has a LiveKit ST_… id), deletes it on LiveKit Cloud first, then removes the local row. ' +
      'Draft trunks (no LiveKit id) are local-only. If LiveKit delete fails (except not-found), the local row is kept so you can retry.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('SIP trunk not found')
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<void> {
    await this.sipTrunksService.removeInbound(this.orgIdFrom(principal), id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a draft inbound trunk to LiveKit',
    description:
      'Calls CreateSIPInboundTrunk. Returns 409 if already live.',
  })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  @ApiConflictError('Trunk is already live')
  publish(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.publishInbound(
      this.orgIdFrom(principal),
      id,
    );
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

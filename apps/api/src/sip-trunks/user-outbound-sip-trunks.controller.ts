import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { CreateSipTrunkDto } from './dto/create-sip-trunk.dto';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { UpdateSipTrunkDto } from './dto/update-sip-trunk.dto';
import { SipTrunksService } from './sip-trunks.service';

/**
 * Org-user outbound SIP trunks (direction=outbound).
 * Org id always from JWT. Passwords never returned.
 * Create links an existing LiveKit ST_… or provisions via LiveKit (same as admin).
 */
@ApiTags('user-outbound-sip-trunks')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/sip-trunks/outbound')
export class UserOutboundSipTrunksController {
  constructor(private readonly sipTrunksService: SipTrunksService) {}

  @Get()
  @ApiOperation({
    summary: 'List outbound SIP trunks for the caller organization',
  })
  @ApiOkResponse({ type: [SipTrunkResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<SipTrunkResponseDto[]> {
    return this.sipTrunksService.listOutboundByOrganization(
      this.orgIdFrom(principal),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one outbound SIP trunk (password redacted)',
  })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.getOutboundOne(this.orgIdFrom(principal), id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or link an outbound SIP trunk',
    description:
      'Pass livekitTrunkId to link an existing LiveKit outbound trunk, or providerAddress (+ optional auth) to provision a new one via LiveKit CreateSIPOutboundTrunk. Sets direction=outbound and status=live. auth_password is never returned.',
  })
  @ApiCreatedResponse({ type: SipTrunkResponseDto })
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.createOutbound(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update local outbound SIP trunk fields',
    description:
      'Updates local name/numbers/isActive/auth only. Does not re-provision or re-sync LiveKit trunk config.',
  })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSipTrunkDto,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.updateOutbound(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete local outbound SIP trunk row',
    description: 'Local delete only; does not remove the LiveKit trunk.',
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.sipTrunksService.removeOutbound(this.orgIdFrom(principal), id);
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

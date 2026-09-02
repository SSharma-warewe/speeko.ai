import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
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
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import { SipTrunkResponseDto } from './dto/sip-trunk-response.dto';
import { SipTrunksService } from './sip-trunks.service';

@ApiTags('user-sip-trunks')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/sip-trunks')
export class UserSipTrunksController {
  constructor(private readonly sipTrunksService: SipTrunksService) {}

  @Get()
  @ApiOperation({
    summary: 'List all SIP trunks for the caller organization',
    description:
      'Outbound + inbound. Passwords are never returned. Prefer /users/sip-trunks/outbound and /users/sip-trunks/inbound for direction-specific writes.',
  })
  @ApiOkResponse({ type: [SipTrunkResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<SipTrunkResponseDto[]> {
    return this.sipTrunksService.listByOrganization(orgIdFrom(principal));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one SIP trunk for the caller organization (password redacted)',
    description:
      'Any direction. For outbound writes use /users/sip-trunks/outbound; for inbound use /users/sip-trunks/inbound.',
  })
  @ApiOkResponse({ type: SipTrunkResponseDto })
  @ApiNotFoundError('SIP trunk not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('SIP trunk')) id: string,
  ): Promise<SipTrunkResponseDto> {
    return this.sipTrunksService.getOne(orgIdFrom(principal), id);
  }

}

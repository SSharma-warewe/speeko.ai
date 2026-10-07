import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthOrgUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors, ApiNotFoundError } from '../common/swagger/api-errors';
import {
  ActiveHumanCallResponseDto,
  CreateHumanCallDto,
  HumanCallResponseDto,
} from './dto/human-call.dto';
import { HumanCallsService } from './services/human-calls.service';

@Controller('users/calls')
@ApiTags('user-calls')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
export class UserHumanCallsController {
  constructor(private readonly human: HumanCallsService) {}
  @Get('human/active')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get human calling availability and your active call',
  })
  @ApiOkResponse({ type: ActiveHumanCallResponseDto })
  active(@CurrentUser() actor: AuthOrgUser) {
    return this.human.active(actor);
  }
  @Post('human')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Prepare a browser call to a CRM contact without AI dispatch',
  })
  @ApiCreatedResponse({ type: HumanCallResponseDto })
  @ApiConflictResponse({
    description: 'Request replay conflict or another active call',
  })
  create(@CurrentUser() actor: AuthOrgUser, @Body() body: CreateHumanCallDto) {
    return this.human.create(actor, body);
  }
  @Post(':id/human/join')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Issue microphone-only Meet credentials to the initiating user',
  })
  @ApiOkResponse({ type: HumanCallResponseDto })
  @ApiNotFoundError('Human call not found')
  join(
    @CurrentUser() actor: AuthOrgUser,
    @Param('id', ParseResourceIdPipe('Call')) id: string,
  ) {
    return this.human.join(actor, id);
  }
  @Post(':id/human/end')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Request idempotent termination of your human call',
  })
  @ApiOkResponse({ type: HumanCallResponseDto })
  @ApiNotFoundError('Human call not found')
  end(
    @CurrentUser() actor: AuthOrgUser,
    @Param('id', ParseResourceIdPipe('Call')) id: string,
  ) {
    return this.human.end(actor, id);
  }
}

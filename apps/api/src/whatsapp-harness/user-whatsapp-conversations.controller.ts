import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { orgIdFrom } from '../auth/org-id';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiJwtErrors } from '../common/swagger/api-errors';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppTickerService } from './whatsapp-ticker.service';

class ResolveWhatsAppSendDto {
  @ApiProperty({
    enum: ['accepted', 'failed'],
    description:
      'Operator-confirmed outcome after checking Meta; failed permits an explicit retry',
  })
  @IsIn(['accepted', 'failed'])
  outcome!: 'accepted' | 'failed';
}

@ApiTags('user-whatsapp-conversations')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/whatsapp')
export class UserWhatsAppConversationsController {
  constructor(
    private readonly repository: WhatsAppHarnessRepository,
    private readonly ticker: WhatsAppTickerService,
  ) {}
  @Get('harness/health')
  @ApiOkResponse()
  @ApiOperation({ summary: 'Inspect the WhatsApp API ticker health' })
  health() {
    return this.ticker.health();
  }
  @Get('conversations')
  @ApiOkResponse()
  @ApiOperation({ summary: 'List the org latest 50 durable conversations' })
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.repository.inspect(orgIdFrom(principal));
  }
  @Get('conversations/:id')
  @ApiOkResponse()
  @ApiOperation({
    summary: 'Inspect the latest 100 turns and outgoing message states',
  })
  get(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp conversation')) id: string,
  ) {
    return this.repository.inspect(orgIdFrom(principal), id);
  }
  @Post('turns/:id/retry')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({
    summary:
      'Retry a failed generation turn; does not resend uncertain Meta messages',
  })
  retry(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
  ) {
    return this.repository.retry(orgIdFrom(principal), id);
  }
  @Post('messages/:id/retry')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({
    summary: 'Retry a definitely failed send without rerunning the agent',
  })
  retrySend(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp message')) id: string,
  ) {
    return this.repository.resolveSend(orgIdFrom(principal), id, 'retry');
  }
  @Post('messages/:id/resolve')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({
    summary: 'Record an operator-confirmed outcome for an uncertain send',
  })
  resolveSend(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('WhatsApp message')) id: string,
    @Body() dto: ResolveWhatsAppSendDto,
  ) {
    return this.repository.resolveSend(orgIdFrom(principal), id, dto.outcome);
  }
}

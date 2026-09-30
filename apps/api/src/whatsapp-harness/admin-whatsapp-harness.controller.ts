import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiJwtErrors,
  ApiNotFoundError,
  ApiConflictError,
} from '../common/swagger/api-errors';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppTickerService } from './whatsapp-ticker.service';
import { OtpDeliveryRepository } from './otp-delivery.repository';
import { ResolveWhatsAppSendDto } from './user-whatsapp-conversations.controller';

@ApiTags('admin-whatsapp-harness')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/whatsapp')
export class AdminWhatsAppHarnessController {
  constructor(
    private readonly repository: WhatsAppHarnessRepository,
    private readonly ticker: WhatsAppTickerService,
    private readonly otp: OtpDeliveryRepository,
  ) {}
  @Get('harness/health')
  @ApiOkResponse()
  health() {
    return this.ticker.health();
  }
  @Get('conversations')
  @ApiOkResponse()
  list() {
    return this.repository.inspect(null);
  }
  @Get('conversations/:id')
  @ApiOkResponse()
  @ApiNotFoundError()
  get(@Param('id', ParseResourceIdPipe('WhatsApp conversation')) id: string) {
    return this.repository.inspect(null, id);
  }
  @Get('otp-deliveries')
  @ApiOkResponse()
  deliveries() {
    return this.otp.diagnostics();
  }
  @Post('turns/:id/retry')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiNotFoundError()
  @ApiConflictError()
  retry(@Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string) {
    return this.repository.retry(null, id);
  }
  @Post('messages/:id/retry')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiNotFoundError()
  @ApiConflictError()
  retrySend(@Param('id', ParseResourceIdPipe('WhatsApp message')) id: string) {
    return this.repository.resolveSend(null, id, 'retry');
  }
  @Post('messages/:id/resolve')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiNotFoundError()
  @ApiConflictError()
  resolve(
    @Param('id', ParseResourceIdPipe('WhatsApp message')) id: string,
    @Body() dto: ResolveWhatsAppSendDto,
  ) {
    return this.repository.resolveSend(null, id, dto.outcome);
  }
}

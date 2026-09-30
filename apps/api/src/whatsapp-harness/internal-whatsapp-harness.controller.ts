import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodError } from 'zod';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiWorkerErrors } from '../common/swagger/api-errors';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppHarnessService } from './whatsapp-harness.service';
import {
  WhatsAppCheckpointDto,
  WhatsAppFailDto,
  WhatsAppLeaseDto,
  WhatsAppToolDto,
} from './dto/whatsapp-worker.dto';

@ApiTags('internal-whatsapp-harness')
@ApiHeader({ name: 'X-Worker-Secret', required: true })
@ApiWorkerErrors()
@UseGuards(WorkerSecretGuard)
@Controller('internal/whatsapp/turns')
export class InternalWhatsAppHarnessController {
  constructor(
    private readonly repository: WhatsAppHarnessRepository,
    private readonly harness: WhatsAppHarnessService,
  ) {}
  @Post(':id/heartbeat')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({ summary: 'Renew the active WhatsApp turn lease' })
  heartbeat(
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
    @Body() dto: WhatsAppLeaseDto,
  ) {
    return this.repository.heartbeat(id, dto.leaseToken);
  }
  @Post(':id/checkpoint')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({ summary: 'Persist ADK progress for the current turn' })
  checkpoint(
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
    @Body() dto: WhatsAppCheckpointDto,
  ) {
    return this.validate(() =>
      this.harness.checkpoint(id, dto.leaseToken, dto),
    );
  }
  @Post(':id/complete')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({
    summary: 'Commit conversation state and create the reply outbox atomically',
  })
  complete(
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
    @Body() dto: WhatsAppCheckpointDto,
  ) {
    return this.validate(() => this.harness.complete(id, dto.leaseToken, dto));
  }
  @Post(':id/fail')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({ summary: 'Fail or schedule a retry of the current turn' })
  fail(
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
    @Body() dto: WhatsAppFailDto,
  ) {
    return this.repository.fail(id, dto.leaseToken, dto.errorCode);
  }
  @Post(':id/tools')
  @HttpCode(200)
  @ApiOkResponse()
  @ApiOperation({
    summary:
      'Reauthorize and execute an assigned GHL tool using API-owned credentials',
  })
  tools(
    @Param('id', ParseResourceIdPipe('WhatsApp turn')) id: string,
    @Body() dto: WhatsAppToolDto,
  ) {
    return this.harness.executeTool(id, dto.leaseToken, dto.toolId, dto.args);
  }
  private async validate<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException('Invalid WhatsApp session checkpoint');
      throw error;
    }
  }
}

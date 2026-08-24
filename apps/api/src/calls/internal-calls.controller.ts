import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { CallWorkerService } from './services/call-worker.service';
import { CallResponseDto } from './dto/call-response.dto';
import { CompleteCallDto } from './dto/complete-call.dto';
import { EnsureInboundCallDto } from './dto/ensure-inbound-call.dto';

@ApiTags('internal-calls')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls')
export class InternalCallsController {
  constructor(private readonly callWorker: CallWorkerService) {}

  @Post('inbound')
  @ApiOperation({
    summary:
      'Worker job start: create or upsert a calls row for an inbound SIP ring (keyed by roomName)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  ensureInbound(@Body() dto: EnsureInboundCallDto): Promise<CallResponseDto> {
    return this.callWorker.ensureInboundFromWorker(dto);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Worker callback: persist transcript, usage, and final status',
  })
  @ApiOkResponse({ type: CallResponseDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCallDto,
  ): Promise<CallResponseDto> {
    return this.callWorker.completeFromWorker(id, dto);
  }
}

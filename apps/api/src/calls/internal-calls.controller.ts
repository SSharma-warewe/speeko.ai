import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { ApiNotFoundError, ApiWorkerErrors } from '../common/swagger/api-errors';
import { CallWorkerService } from './services/call-worker.service';
import { CallResponseDto } from './dto/call-response.dto';
import { CompleteCallDto } from './dto/complete-call.dto';
import { EnsureInboundCallDto } from './dto/ensure-inbound-call.dto';
import { HumanCallTranscriptionService } from './services/human-call-transcription.service';
import { HumanTranscriptionStartDto, HumanTranscriptionCheckpointDto, HumanTranscriptionFinishDto } from './dto/human-transcription.dto';

@ApiTags('internal-calls')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@ApiWorkerErrors()
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls')
export class InternalCallsController {
  constructor(private readonly callWorker: CallWorkerService, private readonly transcription: HumanCallTranscriptionService) {}

  @Post(':id/human/transcription/start')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim a silent human-call transcription job' })
  @ApiOkResponse()
  startHumanTranscription(@Param('id', ParseResourceIdPipe('Call')) id: string, @Body() dto: HumanTranscriptionStartDto) {
    return this.transcription.start(id, dto);
  }

  @Post(':id/human/transcription/checkpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Checkpoint final human speech and measured usage' })
  @ApiOkResponse()
  checkpointHumanTranscription(@Param('id', ParseResourceIdPipe('Call')) id: string, @Body() dto: HumanTranscriptionCheckpointDto) {
    return this.transcription.checkpoint(id, dto);
  }

  @Post(':id/human/transcription/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize human speech after hang-up without changing call lifecycle' })
  @ApiOkResponse()
  finishHumanTranscription(@Param('id', ParseResourceIdPipe('Call')) id: string, @Body() dto: HumanTranscriptionFinishDto) {
    return this.transcription.finish(id, dto);
  }

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker job start: create or upsert a calls row for an inbound SIP ring (keyed by roomName)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  ensureInbound(@Body() dto: EnsureInboundCallDto): Promise<CallResponseDto> {
    return this.callWorker.ensureInboundFromWorker(dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker callback: persist transcript, usage, and final status',
  })
  @ApiOkResponse({ type: CallResponseDto })
  @ApiNotFoundError('Call not found')
  complete(
    @Param('id', ParseResourceIdPipe('Call')) id: string,
    @Body() dto: CompleteCallDto,
  ): Promise<CallResponseDto> {
    return this.callWorker.completeFromWorker(id, dto);
  }
}

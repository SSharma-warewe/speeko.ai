import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { CallsService } from './calls.service';
import { CallResponseDto } from './dto/call-response.dto';
import { CompleteCallDto } from './dto/complete-call.dto';

@ApiTags('internal-calls')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls')
export class InternalCallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Worker callback: persist transcript, usage, and final status',
  })
  @ApiOkResponse({ type: CallResponseDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCallDto,
  ): Promise<CallResponseDto> {
    return this.callsService.completeFromWorker(id, dto);
  }
}

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
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
import {
  GhlCalendarToolResponseDto,
  GhlFreeSlotsDto,
  GhlScheduleMeetingDto,
} from './dto/ghl-calendar-tool.dto';
import { GhlCalendarToolsService } from './ghl-calendar-tools.service';

/**
 * Worker-only platform GHL calendar proxy.
 * Secrets stay on the API (GHL_CALENDAR / GHL_API_KEY).
 */
@ApiTags('internal-ghl-calendar')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls')
export class InternalGhlCalendarController {
  constructor(private readonly ghlCalendar: GhlCalendarToolsService) {}

  @Post(':callId/ghl-calendar/free-slots')
  @ApiOperation({
    summary: 'Worker tool: GHL open slots (no existing appointments)',
  })
  @ApiOkResponse({ type: GhlCalendarToolResponseDto })
  freeSlots(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() dto: GhlFreeSlotsDto,
  ): Promise<GhlCalendarToolResponseDto> {
    return this.ghlCalendar.freeSlots(callId, dto);
  }

  @Post(':callId/ghl-calendar/appointments')
  @ApiOperation({ summary: 'Worker tool: book a GHL appointment' })
  @ApiOkResponse({ type: GhlCalendarToolResponseDto })
  scheduleMeeting(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() dto: GhlScheduleMeetingDto,
  ): Promise<GhlCalendarToolResponseDto> {
    return this.ghlCalendar.scheduleMeeting(callId, dto);
  }
}

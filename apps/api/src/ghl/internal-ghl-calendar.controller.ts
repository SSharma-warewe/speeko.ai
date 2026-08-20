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
  GhlLookupContactDto,
  GhlScheduleMeetingDto,
  GhlUpsertContactDto,
} from './dto/ghl-calendar-tool.dto';
import { GhlCalendarToolsService } from './ghl-calendar-tools.service';

/**
 * Worker-only GHL calendar proxy.
 * Secrets stay on the API (org GHL connection PIT — never in metadata).
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

  @Post(':callId/ghl-calendar/contacts/lookup')
  @ApiOperation({
    summary:
      'Worker tool: look up a GHL contact by email/phone (persists ghlContactId when found)',
  })
  @ApiOkResponse({ type: GhlCalendarToolResponseDto })
  lookupContact(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() dto: GhlLookupContactDto,
  ): Promise<GhlCalendarToolResponseDto> {
    return this.ghlCalendar.lookupContact(callId, dto);
  }

  @Post(':callId/ghl-calendar/contacts')
  @ApiOperation({
    summary:
      'Worker tool: upsert a GHL contact (persists ghlContactId on the call)',
  })
  @ApiOkResponse({ type: GhlCalendarToolResponseDto })
  upsertContact(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() dto: GhlUpsertContactDto,
  ): Promise<GhlCalendarToolResponseDto> {
    return this.ghlCalendar.upsertContact(callId, dto);
  }
}

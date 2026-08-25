import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { ApiWorkerErrors } from '../common/swagger/api-errors';
import { CalendarToolsService } from './calendar-tools.service';
import {
  CalendarCancelEventDto,
  CalendarCreateEventDto,
  CalendarFreeBusyDto,
  CalendarListEventsDto,
  CalendarToolResponseDto,
} from './dto/calendar-tool.dto';

/**
 * Worker-only calendar proxy. Secrets stay in the API;
 * worker tools POST here with X-Worker-Secret + callId.
 */
@ApiTags('internal-calendar')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@ApiWorkerErrors()
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls')
export class InternalCalendarController {
  constructor(private readonly calendarTools: CalendarToolsService) {}

  @Post(':callId/calendar/free-busy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker tool: Nylas free/busy for the call agent calendar',
  })
  @ApiOkResponse({ type: CalendarToolResponseDto })
  freeBusy(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: CalendarFreeBusyDto,
  ): Promise<CalendarToolResponseDto> {
    return this.calendarTools.freeBusy(callId, dto);
  }

  @Post(':callId/calendar/events/list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Worker tool: list calendar events' })
  @ApiOkResponse({ type: CalendarToolResponseDto })
  listEvents(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: CalendarListEventsDto,
  ): Promise<CalendarToolResponseDto> {
    return this.calendarTools.listEvents(callId, dto);
  }

  @Post(':callId/calendar/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Worker tool: create calendar event' })
  @ApiOkResponse({ type: CalendarToolResponseDto })
  createEvent(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: CalendarCreateEventDto,
  ): Promise<CalendarToolResponseDto> {
    return this.calendarTools.createEvent(callId, dto);
  }

  @Post(':callId/calendar/events/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Worker tool: cancel/delete calendar event' })
  @ApiOkResponse({ type: CalendarToolResponseDto })
  cancelEvent(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: CalendarCancelEventDto,
  ): Promise<CalendarToolResponseDto> {
    return this.calendarTools.cancelEvent(callId, dto);
  }
}

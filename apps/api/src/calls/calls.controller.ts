import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallDialService } from './services/call-dial.service';
import { CallWebTestService } from './services/call-web-test.service';
import { CallsService } from './services/calls.service';
import { CallResponseDto, TestCallResponseDto } from './dto/call-response.dto';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CreateTestCallDto } from './dto/create-test-call.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';

@ApiTags('calls')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly callWebTest: CallWebTestService,
    private readonly callDial: CallDialService,
  ) {}

  @Post('test')
  @ApiOperation({
    summary: 'Start a web test call for an inbound/outbound agent',
    description:
      'Persists a Call, creates a LiveKit room, dispatches the worker with persona + task + enabled tool IDs as metadata, and returns a participant token + Meet URL. Open meetUrl in a browser (allow mic) to talk to the agent.',
  })
  @ApiCreatedResponse({ type: TestCallResponseDto })
  createTestCall(@Body() dto: CreateTestCallDto): Promise<TestCallResponseDto> {
    return this.callWebTest.createTestCall(dto);
  }

  @Post('outbound')
  @ApiOperation({
    summary: 'Place an outbound SIP call',
    description:
      'Resolves org agent + SIP trunk, creates a LiveKit room, dispatches the voice worker, and dials via CreateSIPParticipant. Phone number from toNumber or context.phoneNumber. Returns quickly when waitUntilAnswered is false (default).',
  })
  @ApiCreatedResponse({ type: CallResponseDto })
  createOutbound(
    @Body() dto: CreateOutboundCallDto,
  ): Promise<CallResponseDto> {
    return this.callDial.createOutboundCall(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List recent calls' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiOkResponse({ type: [CallResponseDto] })
  list(@Query() query: ListCallsQueryDto): Promise<CallResponseDto[]> {
    return this.callsService.list(query.limit ?? 50);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a call by id' })
  @ApiOkResponse({ type: CallResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CallResponseDto> {
    return this.callsService.findById(id);
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
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
import { AgentDirection } from '../agents/agent.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { CallBucket, CallStatus } from './call.entity';
import { CallDialService } from './services/call-dial.service';
import { CallWebTestService } from './services/call-web-test.service';
import { CallsService } from './services/calls.service';
import {
  CallResponseDto,
  EnqueueCallsResponseDto,
  TestCallResponseDto,
} from './dto/call-response.dto';
import { CreateUserCallsBatchDto } from './dto/create-user-calls-batch.dto';
import { CreateUserOutboundCallDto } from './dto/create-user-outbound-call.dto';
import { CreateUserTestCallDto } from './dto/create-user-test-call.dto';
import { ListCallsQueryDto } from './dto/list-calls-query.dto';

@ApiTags('user-calls')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/calls')
export class UserCallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly callWebTest: CallWebTestService,
    private readonly callDial: CallDialService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Bulk enqueue pending outbound SIP calls (1–50)',
    description:
      'Creates a call_batches row + pending call rows — no LiveKit dial yet. ' +
      'The API queue dialer claims by org concurrency / rate limits / retries. ' +
      'Organization from JWT. Use POST /users/calls/outbound for immediate dial.',
  })
  @ApiCreatedResponse({ type: EnqueueCallsResponseDto })
  enqueue(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateUserCallsBatchDto,
  ): Promise<EnqueueCallsResponseDto> {
    return this.callDial.enqueueCallsForOrg(this.orgIdFrom(principal), dto);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a pending queued call',
  })
  @ApiOkResponse({ type: CallResponseDto })
  cancel(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallResponseDto> {
    return this.callsService.cancelPendingForOrg(this.orgIdFrom(principal), id);
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Force retry soon (pending or failed with attempts left)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  retry(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallResponseDto> {
    return this.callsService.retryNowForOrg(this.orgIdFrom(principal), id);
  }

  @Post(':id/prioritize')
  @ApiOperation({
    summary: 'Bump priority of a pending call (claimed sooner)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  prioritize(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallResponseDto> {
    return this.callsService.prioritizeForOrg(this.orgIdFrom(principal), id);
  }

  @Post('outbound')
  @ApiOperation({
    summary: 'Place an outbound SIP call for the caller organization',
    description:
      'Organization is taken from the JWT. Resolves org agent + SIP trunk, creates a LiveKit room, dispatches the voice worker, and dials via CreateSIPParticipant. Phone number from toNumber or context.phoneNumber.',
  })
  @ApiCreatedResponse({ type: CallResponseDto })
  createOutbound(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateUserOutboundCallDto,
  ): Promise<CallResponseDto> {
    return this.callDial.createOutboundCallForOrg(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Post('test')
  @ApiOperation({
    summary: 'Start a web test call for an organization agent',
    description:
      'Tests the effective org agent config (persona + tools + task) over LiveKit Meet. Organization is taken from the JWT. Open meetUrl in a browser (allow mic) to talk to the agent.',
  })
  @ApiCreatedResponse({ type: TestCallResponseDto })
  createTestCall(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateUserTestCallDto,
  ): Promise<TestCallResponseDto> {
    return this.callWebTest.createOrgAgentTestCall(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List calls for the caller organization',
    description:
      'Filter by direction (inbound / outbound), lifecycle bucket (pending / in_progress / done), exact status, or batchId. ' +
      'SIP inbound rings are upserted by the worker on job start (direction=inbound).',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({
    name: 'bucket',
    required: false,
    enum: CallBucket,
  })
  @ApiQuery({ name: 'status', required: false, enum: CallStatus })
  @ApiQuery({ name: 'direction', required: false, enum: AgentDirection })
  @ApiQuery({ name: 'batchId', required: false, type: String })
  @ApiOkResponse({ type: [CallResponseDto] })
  list(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: ListCallsQueryDto,
  ): Promise<CallResponseDto[]> {
    return this.callsService.listByOrganization(this.orgIdFrom(principal), {
      limit: query.limit ?? 50,
      bucket: query.bucket,
      status: query.status,
      batchId: query.batchId,
      direction: query.direction,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a call by id (caller organization only)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  findOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallResponseDto> {
    return this.callsService.findByIdForOrganization(
      id,
      this.orgIdFrom(principal),
    );
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

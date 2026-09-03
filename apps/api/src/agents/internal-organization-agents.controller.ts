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
import { ApiNotFoundError, ApiWorkerErrors } from '../common/swagger/api-errors';
import { ResolveInboundJobMetadataDto } from './dto/resolve-inbound-job-metadata.dto';
import { OrganizationAgentsService } from './organization-agents.service';

/**
 * Worker-only live inbound job metadata.
 * Dispatch-rule snapshots stay static at publish; each ring re-reads the
 * current org agent (persona / tools / voice / realtime vs pipeline).
 */
@ApiTags('internal-organization-agents')
@ApiHeader({
  name: 'X-Worker-Secret',
  description: 'Shared secret (WORKER_CALLBACK_SECRET)',
  required: true,
})
@ApiWorkerErrors()
@UseGuards(WorkerSecretGuard)
@Controller('internal/organization-agents')
export class InternalOrganizationAgentsController {
  constructor(
    private readonly organizationAgents: OrganizationAgentsService,
  ) {}

  @Post(':id/job-metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker inbound job start: pack current org-agent persona/tools/voice',
  })
  @ApiOkResponse({ description: 'Packed LiveKit job metadata' })
  @ApiNotFoundError('Organization agent not found')
  packInboundJobMetadata(
    @Param('id', ParseResourceIdPipe('Organization agent')) id: string,
    @Body() dto: ResolveInboundJobMetadataDto,
  ) {
    return this.organizationAgents.packInboundJobMetadata(
      dto.organizationId,
      id,
    );
  }
}

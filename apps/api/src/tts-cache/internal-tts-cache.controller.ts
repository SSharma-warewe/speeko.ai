import {
  Body,
  Controller,
  Header,
  HttpCode,
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
import {
  ApiForbiddenError,
  ApiWorkerErrors,
} from '../common/swagger/api-errors';
import { TtsCacheService } from './tts-cache.service';
import { TtsCacheLookupDto, TtsCachePublishDto } from './dto/tts-cache.dto';

@ApiTags('internal-tts-cache')
@ApiHeader({ name: 'X-Worker-Secret', required: true })
@ApiWorkerErrors()
@ApiForbiddenError('Call scope or shared-cache policy denied')
@UseGuards(WorkerSecretGuard)
@Controller('internal/calls/:callId/tts-cache')
export class InternalTtsCacheController {
  constructor(private readonly cache: TtsCacheService) {}
  @Post('lookup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Look up a complete tenant-scoped speech clip' })
  @ApiOkResponse({
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: { hit: { type: 'boolean', enum: [false] } },
          required: ['hit'],
        },
        {
          type: 'object',
          properties: {
            hit: { type: 'boolean', enum: [true] },
            expiresAt: { type: 'string', format: 'date-time' },
            envelope: { type: 'object', additionalProperties: true },
          },
          required: ['hit', 'expiresAt', 'envelope'],
        },
      ],
    },
  })
  lookup(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: TtsCacheLookupDto,
  ) {
    return this.cache.lookup(callId, dto);
  }
  @Post('publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Publish a complete immutable tenant-scoped speech clip',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        result: {
          type: 'string',
          enum: ['stored', 'already_present', 'skipped'],
        },
      },
      required: ['result'],
    },
  })
  publish(
    @Param('callId', ParseResourceIdPipe('Call')) callId: string,
    @Body() dto: TtsCachePublishDto,
  ) {
    return this.cache.publish(callId, dto);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { WorkerSecretGuard } from '../auth/guards/worker-secret.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import { WhatsAppTaskTestsService } from './whatsapp-task-tests.service';

@ApiTags('internal-whatsapp-task-tests')
@ApiHeader({ name: 'X-Worker-Secret', required: true })
@UseGuards(WorkerSecretGuard)
@Controller('internal/whatsapp/test-turns')
export class InternalWhatsAppTaskTestsController {
  constructor(private readonly tests: WhatsAppTaskTestsService) {}
  @Post(':id/:action')
  @HttpCode(200)
  async callback(
    @Param('id', ParseResourceIdPipe('Sandbox turn')) id: string,
    @Param('action') action: string,
    @Body() input: Record<string, unknown>,
  ) {
    const lease = z.string().uuid().safeParse(input?.leaseToken);
    if (!lease.success) throw new BadRequestException('Invalid sandbox lease');
    try {
      return await this.tests.callback(id, lease.data, action, input);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException('Invalid sandbox callback');
      throw error;
    }
  }
}

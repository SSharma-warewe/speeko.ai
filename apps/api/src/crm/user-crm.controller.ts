import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { orgIdFrom } from '../auth/org-id';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiBadGatewayError,
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
  ApiTooManyRequestsError,
} from '../common/swagger/api-errors';
import { CrmCommandDto } from './dto/crm-command.dto';
import { CrmService } from './crm.service';

@ApiTags('user-crm')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@ApiNotFoundError('CRM connection or record not found')
@ApiBadGatewayError('HighLevel unavailable or returned an unconfirmed result')
@ApiConflictError('HighLevel conflict')
@ApiTooManyRequestsError('HighLevel rate limit')
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/crm')
export class UserCrmController {
  constructor(private readonly crm: CrmService) {}

  @Post(':integrationId/execute')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Run a live CRM operation using this organization’s saved HighLevel connection',
    description:
      'Explicit action allowlist with strict parameters. No arbitrary proxy URLs. Mutations are saved to HighLevel immediately and are never automatically retried.',
  })
  @ApiOkResponse({
    schema: { type: 'object', additionalProperties: true },
    description:
      'HighLevel resource envelope (contacts, contact, calendars, events, opportunities, notes, tasks, conversations, messages, workflows, tags, customFields, users, or mutation receipt).',
  })
  execute(
    @CurrentUser() principal: AuthPrincipal,
    @Param('integrationId', ParseResourceIdPipe('CRM connection')) id: string,
    @Body() dto: CrmCommandDto,
  ) {
    return this.crm.execute(orgIdFrom(principal), id, dto);
  }
}

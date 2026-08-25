import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserGuard } from '../auth/guards/user.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { CreateToolProfileDto } from './dto/create-tool-profile.dto';
import { ToolProfileResponseDto } from './dto/tool-profile-response.dto';
import { UpdateToolProfileDto } from './dto/update-tool-profile.dto';
import { ToolProfilesService } from './tool-profiles.service';

@ApiTags('user-tool-profiles')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@UseGuards(JwtAuthGuard, UserGuard)
@Controller('users/tool-profiles')
export class UserToolProfilesController {
  constructor(private readonly toolProfilesService: ToolProfilesService) {}

  @Get('known-tools')
  @ApiOperation({
    summary: 'List known worker tool ids that can be added to a profile',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        toolIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  knownTools() {
    return { toolIds: this.toolProfilesService.knownToolIds() };
  }

  @Get()
  @ApiOperation({
    summary: 'List tool profiles visible to the caller org',
    description:
      'Platform catalog + custom profiles owned by the caller organization.',
  })
  @ApiOkResponse({ type: [ToolProfileResponseDto] })
  list(@CurrentUser() principal: AuthPrincipal) {
    return this.toolProfilesService.listForOrganization(
      this.orgIdFrom(principal),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tool profile (platform or own org)' })
  @ApiOkResponse({ type: ToolProfileResponseDto })
  @ApiNotFoundError('Tool profile not found')
  getOne(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Tool profile')) id: string,
  ) {
    return this.toolProfilesService.getResponseForOrganization(
      this.orgIdFrom(principal),
      id,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom tool profile for the caller organization',
    description:
      'Pick known worker tool ids. endCall is always included. Implementations stay in the worker.',
  })
  @ApiCreatedResponse({ type: ToolProfileResponseDto })
  @ApiConflictError('Profile key already exists')
  create(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: CreateToolProfileDto,
  ) {
    return this.toolProfilesService.createForOrganization(
      this.orgIdFrom(principal),
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a custom tool profile owned by the caller org',
    description: 'Platform seeds cannot be modified.',
  })
  @ApiOkResponse({ type: ToolProfileResponseDto })
  @ApiNotFoundError('Tool profile not found')
  update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Tool profile')) id: string,
    @Body() dto: UpdateToolProfileDto,
  ) {
    return this.toolProfilesService.updateForOrganization(
      this.orgIdFrom(principal),
      id,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a custom tool profile owned by the caller org',
    description:
      'Fails if any organization agent still references the profile. Platform seeds cannot be deleted.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundError('Tool profile not found')
  @ApiConflictError('Profile is still used by agents')
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseResourceIdPipe('Tool profile')) id: string,
  ): Promise<void> {
    await this.toolProfilesService.removeForOrganization(
      this.orgIdFrom(principal),
      id,
    );
  }

  private orgIdFrom(principal: AuthPrincipal): string {
    if (principal.typ !== 'user' || !principal.orgId) {
      throw new ForbiddenException('Organization user access required');
    }
    return principal.orgId;
  }
}

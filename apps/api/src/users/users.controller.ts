import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParseResourceIdPipe } from '../common/parse-resource-id.pipe';
import {
  ApiConflictError,
  ApiJwtErrors,
  ApiNotFoundError,
} from '../common/swagger/api-errors';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiJwtErrors()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('admin/organizations/:orgId/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Register a user under an organization' })
  @ApiCreatedResponse({ description: 'Created user (no password hash)' })
  @ApiNotFoundError('Organization not found')
  @ApiConflictError('Email already exists in this organization')
  async create(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    const user = await this.usersService.createForOrganization(orgId, dto);
    return this.usersService.toSafeUser(user);
  }

  @Get('admin/organizations/:orgId/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'List users in an organization' })
  @ApiOkResponse({ description: 'Users (no password hashes)' })
  @ApiNotFoundError('Organization not found')
  async findAll(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
  ) {
    const users = await this.usersService.listByOrganization(orgId);
    return users.map((u) => this.usersService.toSafeUser(u));
  }

  @Post('admin/organizations/:orgId/users/:userId/invite')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Re-send the set-password invite for a user who has not set one',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '{ ok: true }' })
  @ApiNotFoundError('Organization or user not found')
  @ApiConflictError('User already has a password')
  async resendInvite(
    @Param('orgId', ParseResourceIdPipe('Organization')) orgId: string,
    @Param('userId', ParseResourceIdPipe('User')) userId: string,
  ) {
    await this.usersService.resendInvite(orgId, userId);
    return { ok: true };
  }
}

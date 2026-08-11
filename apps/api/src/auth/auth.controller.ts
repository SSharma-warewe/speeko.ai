import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserLoginDto } from './dto/user-login.dto';
import type { AuthPrincipal } from './auth.types';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserGuard } from './guards/user.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @ApiOperation({ summary: 'Platform admin login' })
  @ApiOkResponse({ type: TokenResponseDto })
  adminLogin(@Body() dto: AdminLoginDto): Promise<TokenResponseDto> {
    return this.authService.adminLogin(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Organization user login',
    description:
      'Requires organizationSlug or organizationId because emails are unique per organization only.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  userLogin(@Body() dto: UserLoginDto): Promise<TokenResponseDto> {
    return this.authService.userLogin(dto);
  }

  @Get('admin/me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Current platform admin profile' })
  adminMe(@CurrentUser() principal: AuthPrincipal) {
    return this.authService.getAdminProfile(principal.id);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({ summary: 'Current organization user profile' })
  userMe(@CurrentUser() principal: AuthPrincipal) {
    return this.authService.getUserProfile(principal.id);
  }
}

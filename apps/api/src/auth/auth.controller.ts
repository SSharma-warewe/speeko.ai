import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBadRequestError,
  ApiJwtErrors,
  ApiTooManyRequestsError,
  ApiUnauthorizedError,
} from '../common/swagger/api-errors';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AdminForgotPasswordDto, ForgotPasswordDto } from './dto/forgot-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OkResponseDto } from './dto/ok-response.dto';
import { AdminResetPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserLoginDto } from './dto/user-login.dto';
import type { AuthPrincipal } from './auth.types';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { PasswordPublicRateLimitGuard } from './guards/password-public-rate-limit.guard';
import { UserGuard } from './guards/user.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({ summary: 'Platform admin login' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiBadRequestError()
  @ApiUnauthorizedError('Invalid credentials')
  @ApiTooManyRequestsError('Too many login attempts for this IP + email')
  adminLogin(@Body() dto: AdminLoginDto): Promise<TokenResponseDto> {
    return this.authService.adminLogin(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({
    summary: 'Organization user login',
    description:
      'Requires organizationSlug or organizationId because emails are unique per organization only. Rate-limited per IP + email.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiBadRequestError()
  @ApiUnauthorizedError('Invalid credentials')
  @ApiTooManyRequestsError('Too many login attempts for this IP + email')
  userLogin(@Body() dto: UserLoginDto): Promise<TokenResponseDto> {
    return this.authService.userLogin(dto);
  }

  @Get('admin/me')
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Current platform admin profile' })
  @ApiOkResponse({ description: 'Admin profile' })
  adminMe(@CurrentUser() principal: AuthPrincipal) {
    return this.authService.getAdminProfile(principal.id);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({ summary: 'Current organization user profile' })
  @ApiOkResponse({ description: 'Org user profile' })
  userMe(@CurrentUser() principal: AuthPrincipal) {
    return this.authService.getUserProfile(principal.id);
  }

  @Patch('me')
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({ summary: 'Update the current org user display name' })
  @ApiOkResponse({ description: 'Updated org user profile' })
  updateUserProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateUserProfile(principal.id, dto);
  }

  @Patch('admin/me')
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Update the current platform admin display name' })
  @ApiOkResponse({ description: 'Updated admin profile' })
  updateAdminProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateAdminProfile(principal.id, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, UserGuard)
  @ApiOperation({ summary: 'Change the current org user password' })
  @ApiOkResponse({ type: OkResponseDto })
  changeUserPassword(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changeUserPassword(principal.id, dto);
  }

  @Post('admin/password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiJwtErrors()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Change the current platform admin password' })
  @ApiOkResponse({ type: OkResponseDto })
  changeAdminPassword(
    @CurrentUser() principal: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changeAdminPassword(principal.id, dto);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordPublicRateLimitGuard)
  @ApiOperation({ summary: 'Set password from an invite link' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestError('Invalid or expired invite link')
  @ApiTooManyRequestsError('Too many attempts')
  setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setUserPassword(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordPublicRateLimitGuard)
  @ApiOperation({
    summary: 'Request a user password reset (or re-send invite if unset)',
  })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestError()
  @ApiTooManyRequestsError('Too many attempts')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotUserPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordPublicRateLimitGuard)
  @ApiOperation({ summary: 'Reset an org user password from email token' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestError('Invalid or expired reset link')
  @ApiTooManyRequestsError('Too many attempts')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetUserPassword(dto);
  }

  @Post('admin/forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordPublicRateLimitGuard)
  @ApiOperation({ summary: 'Request a platform admin password reset' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestError()
  @ApiTooManyRequestsError('Too many attempts')
  forgotAdminPassword(@Body() dto: AdminForgotPasswordDto) {
    return this.authService.forgotAdminPassword(dto.email);
  }

  @Post('admin/reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PasswordPublicRateLimitGuard)
  @ApiOperation({ summary: 'Reset a platform admin password from email token' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestError('Invalid or expired reset link')
  @ApiTooManyRequestsError('Too many attempts')
  resetAdminPassword(@Body() dto: AdminResetPasswordDto) {
    return this.authService.resetAdminPassword(dto);
  }
}

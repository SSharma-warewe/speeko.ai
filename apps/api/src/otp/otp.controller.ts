import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiBadGatewayError,
  ApiBadRequestError,
  ApiForbiddenError,
  ApiTooManyRequestsError,
  ApiUnavailableError,
} from '../common/swagger/api-errors';
import { SendOtpDto } from './dto/send-otp.dto';
import { SendOtpResponseDto, VerifyOtpResponseDto } from './dto/otp-response.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpAbuseGuard } from './guards/otp-abuse.guard';
import { OtpService } from './otp.service';

@ApiTags('otp')
@Controller('otp')
@UseGuards(OtpAbuseGuard)
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a WhatsApp code for the get-demo form',
    description:
      'Public. Generates a 6-digit code, stores only an HMAC, and sends the speeko_ai ' +
      'WhatsApp template. The response is a challenge id — never the code.',
  })
  @ApiOkResponse({ type: SendOtpResponseDto })
  @ApiBadRequestError()
  @ApiForbiddenError('Origin not allowed (when CORS_ORIGIN is set)')
  @ApiTooManyRequestsError('Per-IP or per-phone OTP send limit')
  @ApiUnavailableError('WHATSAPP_URL, WHATSAPP_API_KEY, or OTP_HASH_SECRET not set')
  @ApiBadGatewayError('WhatsApp template send failed')
  send(@Body() dto: SendOtpDto): Promise<SendOtpResponseDto> {
    return this.otp.send(dto.phone);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a WhatsApp code',
    description:
      'Public. Checks the code server-side and returns a single-use verification token ' +
      'bound to that phone. Wrong, expired, and locked codes share one error.',
  })
  @ApiOkResponse({ type: VerifyOtpResponseDto })
  @ApiBadRequestError('Incorrect, expired, or locked code')
  @ApiForbiddenError('Origin not allowed (when CORS_ORIGIN is set)')
  @ApiTooManyRequestsError('Per-IP OTP verify limit')
  @ApiUnavailableError('WHATSAPP_URL, WHATSAPP_API_KEY, or OTP_HASH_SECRET not set')
  verify(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    return this.otp.verify(dto.challengeId, dto.code);
  }
}

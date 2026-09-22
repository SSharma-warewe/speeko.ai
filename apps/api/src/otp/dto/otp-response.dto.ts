import { ApiProperty } from '@nestjs/swagger';

export class SendOtpResponseDto {
  @ApiProperty({ format: 'uuid' })
  challengeId!: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty({
    description:
      'Single-use proof for POST /demo/request. Not the WhatsApp code.',
  })
  verificationToken!: string;
}

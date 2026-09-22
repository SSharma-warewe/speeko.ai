import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Matches } from 'class-validator';
import { trimString } from '../../common/trim-string';

export class VerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456', description: '6-digit WhatsApp code' })
  @Transform(trimString)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from WhatsApp.' })
  code!: string;
}

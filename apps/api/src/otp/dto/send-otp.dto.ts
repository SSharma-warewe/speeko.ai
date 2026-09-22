import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { stripDemoPhone } from '../../demo/demo-form.constants';

export class SendOtpDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'Phone number that will receive the WhatsApp code',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? stripDemoPhone(value) : value,
  )
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;
}

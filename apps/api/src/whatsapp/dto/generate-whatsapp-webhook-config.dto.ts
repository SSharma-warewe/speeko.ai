import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateWhatsAppWebhookConfigDto {
  @ApiPropertyOptional({
    example: '106540352242922',
    description:
      'WhatsApp Business phone number id (`metadata.phone_number_id`). ' +
      'Required if wabaId is omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  phoneNumberId?: string;

  @ApiPropertyOptional({
    example: '102290129340398',
    description:
      'WhatsApp Business Account id (`entry.id`). Required if phoneNumberId is omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  wabaId?: string;
}

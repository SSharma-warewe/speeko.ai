import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MAX_WHATSAPP_RECIPIENTS = 50;

export class SendWhatsAppRecipientDto {
  @ApiPropertyOptional({ description: 'GoHighLevel contact id (for the log).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ghlContactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @ApiPropertyOptional({
    description: 'GoHighLevel do-not-disturb flag. true = skipped, not sent.',
  })
  @IsOptional()
  @IsBoolean()
  dnd?: boolean;
}

export class SendWhatsAppTemplateDto {
  @ApiProperty({ example: 'appointment_reminder' })
  @IsString()
  @Matches(/^[a-z0-9_]{1,512}$/, {
    message: 'templateName must be lowercase letters, numbers, or underscores',
  })
  templateName!: string;

  @ApiProperty({ example: 'en_US' })
  @IsString()
  @Matches(/^[A-Za-z]{2,3}(_[A-Za-z0-9]{2,4})?$/, {
    message: 'language must be a WhatsApp language code like en or en_US',
  })
  language!: string;

  @ApiPropertyOptional({
    description:
      'Body variables keyed by variable key. Each value is { type: "field", field } or { type: "text", text }.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  bodyVariables?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Source for the dynamic URL-button variable: { type: "field", field } or { type: "text", text }.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  urlButtonVariable?: Record<string, unknown>;

  @ApiProperty({ type: [SendWhatsAppRecipientDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_WHATSAPP_RECIPIENTS)
  @ValidateNested({ each: true })
  @Type(() => SendWhatsAppRecipientDto)
  recipients!: SendWhatsAppRecipientDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsAppWebhookConfigResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({
    example: 'https://api.example.com/api/webhooks/whatsapp',
    description:
      'Callback URL to paste into the Meta App Dashboard (or WABA webhook override).',
  })
  callbackUrl!: string;

  @ApiProperty({
    example: 'wa_abcd12…',
    description: 'Verify token prefix for display only',
  })
  verifyTokenPrefix!: string;

  @ApiPropertyOptional({ nullable: true, example: '106540352242922' })
  phoneNumberId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '102290129340398' })
  wabaId!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Generate / rotate response: includes the raw verify token once. */
export class WhatsAppWebhookConfigSecretResponseDto extends WhatsAppWebhookConfigResponseDto {
  @ApiProperty({
    example: 'wa_…',
    description:
      'Full Meta hub.verify_token — shown only once on generate. Store securely.',
  })
  verifyToken!: string;
}

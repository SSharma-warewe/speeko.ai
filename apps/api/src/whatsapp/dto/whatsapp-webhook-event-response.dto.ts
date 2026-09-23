import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsAppWebhookEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Null when the post did not match a phone number id or WABA id',
  })
  organizationId!: string | null;

  @ApiProperty({ example: 'messages' })
  eventType!: string;

  @ApiProperty({
    description: 'Raw webhook JSON',
    type: 'object',
    additionalProperties: true,
  })
  payload!: unknown;

  @ApiProperty({ type: String, format: 'date-time' })
  receivedAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    example: '16315551181: Hello',
    description: 'Short text from the first inbound message, when present',
  })
  preview!: string | null;
}

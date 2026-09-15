import { ApiProperty } from '@nestjs/swagger';

export class WhatsAppWebhookAckDto {
  @ApiProperty({ example: true })
  success!: true;
}

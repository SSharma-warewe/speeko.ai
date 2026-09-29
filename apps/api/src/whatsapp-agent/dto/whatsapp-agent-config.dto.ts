import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class WhatsAppAgentConfigDto {
  @ApiProperty({
    nullable: true,
    description:
      'Inbound agent system prompt. Null when unset; empty clears and disables auto-reply.',
  })
  systemPrompt!: string | null;

  @ApiProperty({
    description:
      'Read-only platform receptionist prompt, offered as an example for org agents.',
  })
  platformPrompt!: string;
}

export class UpdateWhatsAppAgentDto {
  @ApiProperty({
    description:
      'System prompt for inbound WhatsApp auto-replies. Empty string clears and disables.',
    maxLength: 20000,
  })
  @IsString()
  @MaxLength(20000)
  systemPrompt!: string;
}

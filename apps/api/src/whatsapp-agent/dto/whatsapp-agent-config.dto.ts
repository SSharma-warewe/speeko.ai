import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class WhatsAppAgentConfigDto {
  @ApiProperty({
    nullable: true,
    description:
      'Inbound agent system prompt. Null when unset; empty clears and disables auto-reply.',
  })
  systemPrompt!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Existing org voice agent providing the GHL calendar and booking credentials.',
  })
  bookingVoiceAgentId!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Existing tool profile controlling available GHL booking tools.',
  })
  whatsappToolProfileId!: string | null;

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

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Existing org voice agent to use for GHL booking; null disables booking tools.',
  })
  @IsOptional()
  @IsUUID()
  bookingVoiceAgentId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Tool profile to grant GHL contact and calendar tools; null disables them.',
  })
  @IsOptional()
  @IsUUID()
  whatsappToolProfileId?: string | null;
}

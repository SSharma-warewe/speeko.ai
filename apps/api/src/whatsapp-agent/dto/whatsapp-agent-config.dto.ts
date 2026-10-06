import { ApiProperty } from '@nestjs/swagger';
import {
  IsObject,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  WHATSAPP_TASK_KEYS,
  type WhatsAppTaskKey,
} from '@call-agent/contracts';

export class WhatsAppAgentConfigDto {
  @ApiProperty({ nullable: true }) whatsappTaskId!: string | null;
  @ApiProperty({ type: Object }) taskContext!: Record<string, unknown>;
  @ApiProperty({ enum: WHATSAPP_TASK_KEYS, nullable: true })
  taskKey!: WhatsAppTaskKey | null;
  @ApiProperty({
    nullable: true,
    description:
      'Inbound agent persona. A selected task is also required for auto-replies; null/empty persona disables them.',
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
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  whatsappTaskId?: string | null;
  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  taskContext?: Record<string, unknown>;
  @ApiProperty({ enum: WHATSAPP_TASK_KEYS, nullable: true, required: false })
  @IsOptional()
  @IsIn(WHATSAPP_TASK_KEYS)
  taskKey?: WhatsAppTaskKey | null;
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

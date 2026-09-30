import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  WHATSAPP_AGENT_TOOL_IDS,
  type WhatsAppAgentToolId,
} from '@call-agent/contracts';

export class WhatsAppLeaseDto {
  @ApiProperty() @IsUUID() leaseToken!: string;
}
export class WhatsAppCheckpointDto extends WhatsAppLeaseDto {
  @ApiProperty({
    required: false,
    description:
      'Explicit booking refusal, with a quote from the current user message. Never marks success.',
  })
  @IsOptional()
  @IsObject()
  decline?: { evidence: string };
  @ApiProperty({ description: 'ADK state and ordered events' })
  @IsObject()
  session!: Record<string, unknown>;
  @ApiProperty({ required: false, maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  reply?: string;
}
export class WhatsAppFailDto extends WhatsAppLeaseDto {
  @ApiProperty({ enum: ['model_error', 'turn_aborted', 'empty_reply'] })
  @IsIn(['model_error', 'turn_aborted', 'empty_reply'])
  errorCode!: string;
}
export class WhatsAppToolDto extends WhatsAppLeaseDto {
  @ApiProperty({ enum: WHATSAPP_AGENT_TOOL_IDS })
  @IsIn(WHATSAPP_AGENT_TOOL_IDS)
  toolId!: WhatsAppAgentToolId;
  @ApiProperty() @IsObject() args!: Record<string, string>;
}

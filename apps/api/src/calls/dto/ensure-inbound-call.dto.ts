import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Worker job start: upsert a `calls` row for an inbound SIP ring. */
export class EnsureInboundCallDto {
  @ApiProperty({
    example: 'call-+15551212_AbCd',
    description: 'LiveKit room name (unique upsert key)',
  })
  @IsString()
  @MaxLength(255)
  roomName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationAgentId?: string;

  @ApiPropertyOptional({ example: 'inbound' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentKey?: string;

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    example: '+15551212',
    description: 'Caller number (sip.phoneNumber)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fromNumber?: string;

  @ApiPropertyOptional({
    example: '+18005550100',
    description: 'Dialed number (sip.trunkPhoneNumber)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  toNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  participantIdentity?: string;

  @ApiPropertyOptional({ description: 'LiveKit SIP call id (sip.callID)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  livekitSipCallId?: string;

  @ApiPropertyOptional({
    example: 'ST_abc',
    description: 'LiveKit inbound trunk id (sip.trunkID)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  livekitTrunkId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

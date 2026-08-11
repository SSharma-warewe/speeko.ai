import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SipDispatchRuleType } from '../sip-dispatch-rule.entity';

/** Save a SIP dispatch rule draft locally (not published to LiveKit yet). */
export class CreateSipDispatchRuleDto {
  @ApiProperty({ example: 'Inbound agent routing' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    enum: SipDispatchRuleType,
    default: SipDispatchRuleType.INDIVIDUAL,
  })
  @IsOptional()
  @IsEnum(SipDispatchRuleType)
  ruleType?: SipDispatchRuleType;

  @ApiPropertyOptional({
    example: 'call-',
    description: 'Required for individual (default call-). Optional for callee.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roomPrefix?: string;

  @ApiPropertyOptional({
    example: 'open-room',
    description: 'Required when ruleType is direct',
  })
  @ValidateIf(
    (o: CreateSipDispatchRuleDto) =>
      (o.ruleType ?? SipDispatchRuleType.INDIVIDUAL) ===
      SipDispatchRuleType.DIRECT,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  roomName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  pin?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Callee rule: unique room per caller',
  })
  @IsOptional()
  @IsBoolean()
  randomize?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Local inbound sip_trunks ids this rule binds to',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sipTrunkIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hidePhoneNumber?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Optional LiveKit participant metadata string on the rule',
  })
  @IsOptional()
  @IsString()
  metadata?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Org agent whose persona/tools/task are packed into agent job metadata on publish',
  })
  @IsOptional()
  @IsUUID()
  organizationAgentId?: string;

  @ApiPropertyOptional({
    description: 'LiveKit agent name for roomConfig; defaults to LIVEKIT_AGENT_NAME',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentName?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

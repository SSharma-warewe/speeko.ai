import { ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { SipDispatchRuleType } from '../sip-dispatch-rule.entity';

/** Local-only update; does not auto-sync to LiveKit after publish. */
export class UpdateSipDispatchRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: SipDispatchRuleType })
  @IsOptional()
  @IsEnum(SipDispatchRuleType)
  ruleType?: SipDispatchRuleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roomPrefix?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  roomName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  pin?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomize?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sipTrunkIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hidePhoneNumber?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string> | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  organizationAgentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

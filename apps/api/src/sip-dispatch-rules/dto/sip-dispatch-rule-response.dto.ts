import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SipDispatchRuleType } from '../sip-dispatch-rule.entity';

export class SipDispatchRuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SipDispatchRuleType })
  ruleType!: SipDispatchRuleType;

  @ApiPropertyOptional({ nullable: true })
  roomPrefix!: string | null;

  @ApiPropertyOptional({ nullable: true })
  roomName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  pin!: string | null;

  @ApiProperty()
  randomize!: boolean;

  @ApiProperty({ type: [String], format: 'uuid' })
  sipTrunkIds!: string[];

  @ApiProperty()
  hidePhoneNumber!: boolean;

  @ApiPropertyOptional({ nullable: true, type: 'object', additionalProperties: { type: 'string' } })
  attributes!: Record<string, string> | null;

  @ApiPropertyOptional({ nullable: true })
  metadata!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  agentName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null while draft is unpublished',
  })
  livekitDispatchRuleId!: string | null;

  @ApiProperty({ enum: ['draft', 'live'] })
  status!: 'draft' | 'live';

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

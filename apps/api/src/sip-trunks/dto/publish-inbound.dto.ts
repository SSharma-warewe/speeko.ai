import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Publish draft inbound trunks and/or dispatch rules to LiveKit.
 * Omit both arrays to publish all drafts for the org (trunks first, then rules).
 */
export class PublishInboundDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Local inbound sip_trunks ids to publish',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sipTrunkIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Local sip_dispatch_rules ids to publish',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dispatchRuleIds?: string[];
}

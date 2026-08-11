import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SipDispatchRuleResponseDto } from '../../sip-dispatch-rules/dto/sip-dispatch-rule-response.dto';
import { SipTrunkResponseDto } from './sip-trunk-response.dto';

export class PublishResourceResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['published', 'skipped', 'failed'] })
  outcome!: 'published' | 'skipped' | 'failed';

  @ApiPropertyOptional({ description: 'Reason when skipped or failed' })
  message?: string;

  @ApiPropertyOptional()
  livekitId?: string | null;
}

export class InboundPublishResultDto {
  @ApiProperty({ type: [PublishResourceResultDto] })
  trunks!: PublishResourceResultDto[];

  @ApiProperty({ type: [PublishResourceResultDto] })
  dispatchRules!: PublishResourceResultDto[];

  @ApiPropertyOptional({
    type: [SipTrunkResponseDto],
    description: 'Updated trunk rows that were published in this request',
  })
  publishedTrunks?: SipTrunkResponseDto[];

  @ApiPropertyOptional({
    type: [SipDispatchRuleResponseDto],
    description: 'Updated dispatch rules published in this request',
  })
  publishedDispatchRules?: SipDispatchRuleResponseDto[];
}

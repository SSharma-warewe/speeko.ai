import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallStatus } from '../../calls/call.entity';

export class PublicEnqueueResponseDto {
  @ApiProperty({ format: 'uuid' })
  callId!: string;

  @ApiProperty({ format: 'uuid' })
  batchId!: string;

  @ApiProperty({ enum: CallStatus, example: CallStatus.PENDING })
  status!: CallStatus;

  @ApiProperty({ example: '+919876543210' })
  toNumber!: string;

  @ApiPropertyOptional({
    example: 'hubspot-deal-55',
    nullable: true,
    description: 'Echo of request externalId when provided',
  })
  externalId!: string | null;
}

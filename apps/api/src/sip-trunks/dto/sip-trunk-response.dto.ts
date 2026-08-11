import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SipTrunkDirection } from '../sip-trunk.entity';

export class SipTrunkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SipTrunkDirection })
  direction!: SipTrunkDirection;

  @ApiPropertyOptional({ nullable: true })
  providerAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  authUsername!: string | null;

  @ApiProperty({ type: [String], example: ['+918065179684'] })
  numbers!: string[];

  @ApiProperty({ type: [String], example: [] })
  allowedNumbers!: string[];

  @ApiProperty({ type: [String], example: [] })
  allowedAddresses!: string[];

  @ApiProperty()
  krispEnabled!: boolean;

  @ApiPropertyOptional({
    example: 'ST_t6rmvwZgb5iV',
    nullable: true,
    description: 'Null while inbound draft is unpublished',
  })
  livekitTrunkId!: string | null;

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

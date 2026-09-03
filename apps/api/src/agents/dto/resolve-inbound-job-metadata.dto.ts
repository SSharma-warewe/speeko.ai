import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResolveInboundJobMetadataDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToolProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'default' })
  key!: string;

  @ApiProperty({ example: 'Default' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Null for platform catalog profiles',
  })
  organizationId!: string | null;

  @ApiProperty({
    description: 'True when organizationId is null (seeded platform profile)',
  })
  isPlatform!: boolean;

  @ApiProperty({ type: [String], example: ['endCall'] })
  toolIds!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

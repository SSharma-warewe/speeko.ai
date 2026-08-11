import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CloneOrganizationAgentDto {
  @ApiProperty({
    example: 'Collections outreach',
    description: 'Display name for the cloned org agent config',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'collections-outreach',
    description:
      'Unique-per-org slug. Defaults from name. Letters, numbers, hyphens.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must be lowercase alphanumeric with optional single hyphens (e.g. collections-outreach)',
  })
  slug?: string;
}

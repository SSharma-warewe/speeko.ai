import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_PATTERN } from '../../common/slug';

export class CreateToolProfileDto {
  @ApiProperty({ example: 'Sales lite' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'sales-lite',
    description:
      'Stable slug. Auto-generated from name if omitted. Unique within the org (or platform).',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(SLUG_PATTERN, {
    message: 'key must be a lowercase slug (a-z, 0-9, hyphens)',
  })
  key?: string;

  @ApiPropertyOptional({ example: 'Booking + hangup only' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({
    type: [String],
    example: ['endCall', 'booking', 'confirmAppointment'],
    description:
      'Worker tool registry ids. Unknown ids rejected. endCall is always included.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  toolIds!: string[];
}

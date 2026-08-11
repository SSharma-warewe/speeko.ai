import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Worker → API calendar tool payloads.
 * Times may be unix seconds (number as string/number) or ISO-8601 strings;
 * the service normalizes to unix seconds.
 */
export class CalendarFreeBusyDto {
  @ApiProperty({
    description: 'Window start (unix seconds or ISO-8601 string)',
    example: '2026-08-12T09:00:00Z',
  })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiProperty({
    description: 'Window end (unix seconds or ISO-8601 string)',
    example: '2026-08-12T17:00:00Z',
  })
  @IsString()
  @MinLength(1)
  endTime!: string;

  @ApiPropertyOptional({
    description: 'Override email for free/busy (defaults to integration email)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}

export class CalendarListEventsDto {
  @ApiPropertyOptional({
    description: 'Range start (unix seconds or ISO-8601)',
  })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Range end (unix seconds or ISO-8601)',
  })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ default: 10, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class CalendarCreateEventDto {
  @ApiProperty({ example: 'Consultation with Ada' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty({
    description: 'Event start (unix seconds or ISO-8601)',
    example: '2026-08-12T14:00:00Z',
  })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiProperty({
    description: 'Event end (unix seconds or ISO-8601)',
    example: '2026-08-12T14:30:00Z',
  })
  @IsString()
  @MinLength(1)
  endTime!: string;

  @ApiPropertyOptional({
    example: 'America/New_York',
    description: 'IANA timezone for the event when times are local-aware',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiPropertyOptional({ example: 'patient@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  participantEmail?: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  participantName?: string;
}

export class CalendarCancelEventDto {
  @ApiProperty({ description: 'Nylas event id returned from create/list' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  eventId!: string;
}

export class CalendarToolResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  data?: unknown;
}

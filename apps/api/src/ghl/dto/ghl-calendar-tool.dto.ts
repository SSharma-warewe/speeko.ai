import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GhlFreeSlotsDto {
  @ApiProperty({
    description: 'Window start (unix seconds or ISO-8601)',
    example: '2026-08-14T09:00:00+05:30',
  })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiProperty({
    description: 'Window end (unix seconds or ISO-8601)',
    example: '2026-08-14T18:00:00+05:30',
  })
  @IsString()
  @MinLength(1)
  endTime!: string;

  @ApiPropertyOptional({
    example: 'Asia/Kolkata',
    description: 'IANA timezone for GHL slot labels',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class GhlScheduleMeetingDto {
  @ApiProperty({
    description:
      'Preferred: exact start string from checkGhlFreeSlots (keeps GHL offset)',
    example: '2026-08-14T10:00:00+05:30',
  })
  @IsString()
  @MinLength(1)
  startTime!: string;

  @ApiPropertyOptional({
    description: 'End time; defaults to start + 30 minutes',
  })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({ example: 'Demo — Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  participantEmail?: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  participantName?: string;

  @ApiPropertyOptional({ example: '+15550102000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class GhlCalendarToolResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  data?: unknown;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Save an inbound SIP trunk draft locally (not published to LiveKit yet). */
export class CreateInboundSipTrunkDto {
  @ApiProperty({ example: 'Main inbound' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['+15105550100'],
    description: 'Provider phone numbers accepted by this inbound trunk (E.164 preferred)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  numbers!: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Only accept calls from these caller numbers',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedNumbers?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Only accept SIP from these IPs/CIDRs (requires LiveKit project enablement)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAddresses?: string[];

  @ApiPropertyOptional({ example: 'sip-user' })
  @IsOptional()
  @IsString()
  authUsername?: string;

  @ApiPropertyOptional({ description: 'Never returned in responses' })
  @IsOptional()
  @IsString()
  authPassword?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  krispEnabled?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'ST_existing',
    description:
      'Optional: link an existing LiveKit inbound trunk (marks live immediately, skips draft publish)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  livekitTrunkId?: string;
}

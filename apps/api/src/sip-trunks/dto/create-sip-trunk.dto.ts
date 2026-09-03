import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Create/link an **outbound** SIP trunk (`direction=outbound` always).
 * Provide **either** `livekitTrunkId` (link existing LiveKit ST_…) **or**
 * `providerAddress` (+ optional auth) to provision via LiveKit.
 * Shared by admin and org-user outbound endpoints.
 */
export class CreateSipTrunkDto {
  @ApiProperty({ example: 'Primary outbound' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'ST_t6rmvwZgb5iV',
    description:
      'Existing LiveKit outbound trunk id (ST_…). If set, the trunk is linked (not re-created). Mutually exclusive with providerAddress.',
  })
  @ValidateIf((o: CreateSipTrunkDto) => !o.providerAddress)
  @IsString()
  @MinLength(1)
  livekitTrunkId?: string;

  @ApiPropertyOptional({
    example: 'sip.telnyx.com',
    description:
      'SIP provider hostname. Used with optional auth to provision a new LiveKit outbound trunk. Mutually exclusive with livekitTrunkId.',
  })
  @ValidateIf((o: CreateSipTrunkDto) => !o.livekitTrunkId)
  @IsString()
  @MinLength(1)
  providerAddress?: string;

  @ApiPropertyOptional({ example: 'Warewe' })
  @IsOptional()
  @IsString()
  authUsername?: string;

  @ApiPropertyOptional({ description: 'Never returned in responses' })
  @IsOptional()
  @IsString()
  authPassword?: string;

  @ApiProperty({
    type: [String],
    example: ['+918065179684'],
    description: 'Phone numbers associated with the trunk (E.164 preferred)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  numbers!: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'in' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  destinationCountry?: string;
}

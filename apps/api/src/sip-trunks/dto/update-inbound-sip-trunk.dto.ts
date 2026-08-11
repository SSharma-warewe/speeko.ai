import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Local-only update; does not auto-sync to LiveKit after publish. */
export class UpdateInboundSipTrunkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numbers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedNumbers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAddresses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authUsername?: string;

  @ApiPropertyOptional({ description: 'Never returned in responses' })
  @IsOptional()
  @IsString()
  authPassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  krispEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

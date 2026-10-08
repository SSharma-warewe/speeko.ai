import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsIn, IsInt, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';
import type { HumanCallInterest, HumanCallMeeting, HumanCallWorkspaceActionRequest, ResolveHumanCallActionRequest, UpdateHumanCallWorkspace } from '@call-agent/contracts';

export class UpdateHumanCallWorkspaceDto implements UpdateHumanCallWorkspace {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiPropertyOptional({ enum: ['interested', 'not_interested'], nullable: true })
  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(['interested', 'not_interested', null]) interest?: HumanCallInterest | null;
  @ApiPropertyOptional({ maxLength: 4000 })
  @ValidateIf((_o, value) => value !== undefined)
  @IsString() @MaxLength(4000) notes?: string;
}

export class HumanCallWorkspaceActionDto implements HumanCallWorkspaceActionRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty({ enum: ['bookMeeting', 'publishSummary'] })
  @IsIn(['bookMeeting', 'publishSummary']) kind!: 'bookMeeting' | 'publishSummary';
  // Strict nested validation is owned by HumanCallWorkspaceService's Zod schema.
  @ApiPropertyOptional({ type: Object }) @Allow() meeting?: HumanCallMeeting;
}

export class ResolveHumanCallActionDto implements ResolveHumanCallActionRequest {
  @ApiProperty({ enum: ['found', 'not_found'] }) @IsIn(['found', 'not_found']) resolution!: 'found' | 'not_found';
  @ApiPropertyOptional() @ValidateIf((_o, value) => value !== undefined)
  @IsString() @MaxLength(120) providerId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { HUMAN_CALL_TOOL_IDS, type HumanCallToolId } from '@call-agent/contracts';
import type {
  CreateHumanCallRequest,
  HumanCallSummary,
} from '@call-agent/contracts';
import { CallResponseDto } from './call-response.dto';

export class CreateHumanCallDto implements CreateHumanCallRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() crmIntegrationId!: string;
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  crmContactId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sipTrunkId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
  @ApiPropertyOptional({ enum: HUMAN_CALL_TOOL_IDS, isArray: true })
  @IsOptional() @IsArray() @ArrayMaxSize(3) @ArrayUnique()
  @IsIn(HUMAN_CALL_TOOL_IDS, { each: true }) selectedTools?: HumanCallToolId[];
}
export class HumanCallResponseDto {
  @ApiProperty({ type: CallResponseDto }) call!: CallResponseDto;
  @ApiProperty({ type: Object }) session!: HumanCallSummary;
  @ApiPropertyOptional() meetUrl?: string;
  @ApiPropertyOptional() connection?: { serverUrl: string; participantToken: string };
}
export class ActiveHumanCallResponseDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: HumanCallResponseDto, nullable: true })
  active!: HumanCallResponseDto | null;
}

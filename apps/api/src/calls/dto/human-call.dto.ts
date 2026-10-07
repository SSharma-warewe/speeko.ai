import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
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
}
export class HumanCallResponseDto {
  @ApiProperty({ type: CallResponseDto }) call!: CallResponseDto;
  @ApiProperty({ type: Object }) session!: HumanCallSummary;
  @ApiPropertyOptional() meetUrl?: string;
}
export class ActiveHumanCallResponseDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: HumanCallResponseDto, nullable: true })
  active!: HumanCallResponseDto | null;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  HumanTranscriptionCheckpoint,
  HumanTranscriptionFinish,
  HumanTranscriptionSegment,
  HumanTranscriptionStart,
} from '@call-agent/contracts';

export class HumanTranscriptionStartDto implements HumanTranscriptionStart {
  @IsString() @MinLength(1) @MaxLength(255) roomName!: string;
  @IsString() @MinLength(1) @MaxLength(255) jobId!: string;
}
class SegmentDto implements HumanTranscriptionSegment {
  @IsUUID() id!: string;
  @IsIn(['caller', 'contact']) role!: 'caller' | 'contact';
  @IsString() @MinLength(1) @MaxLength(8000) content!: string;
  @IsISO8601({ strict: true }) createdAt!: string;
}
export class HumanTranscriptionCheckpointDto implements HumanTranscriptionCheckpoint {
  @IsString() @MinLength(1) @MaxLength(255) jobId!: string;
  @IsString() @MinLength(64) @MaxLength(64) callbackToken!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments!: SegmentDto[];
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(172800)
  audioDuration!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(86400)
  listenerDuration!: number;
  @IsOptional() @IsBoolean() partial?: boolean;
}
export class HumanTranscriptionFinishDto
  extends HumanTranscriptionCheckpointDto
  implements HumanTranscriptionFinish
{
  @IsBoolean() answered!: boolean;
}

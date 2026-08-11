import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTestCallDto {
  @ApiPropertyOptional({
    example: 'inbound',
    description: 'Platform agent key (e.g. inbound, outbound). Required if agentId is omitted.',
  })
  @ValidateIf((o: CreateTestCallDto) => !o.agentId)
  @IsString()
  agentKey?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Platform agent template id. Required if agentKey is omitted.',
  })
  @ValidateIf((o: CreateTestCallDto) => !o.agentKey)
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({
    example: 'general',
    description: 'LiveKit task key. Defaults to the platform agent default task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Optional runtime context for the task',
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

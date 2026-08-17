import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CompleteCallDto {
  @ApiProperty({ enum: ['completed', 'failed'] })
  @IsIn(['completed', 'failed'])
  status!: 'completed' | 'failed';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  errorMessage?: string | null;

  @ApiPropertyOptional({
    description: 'ISO timestamp when the callee was answered / joined',
  })
  @IsOptional()
  @IsString()
  answeredAt?: string | null;

  @ApiPropertyOptional({ description: 'ISO timestamp when the session ended' })
  @IsOptional()
  @IsString()
  endedAt?: string | null;

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        content: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  })
  @IsOptional()
  @IsArray()
  transcript?: Array<{
    role: string;
    content: string;
    createdAt?: string | number | null;
    id?: string;
  }> | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  usage?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  sessionReport?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Structured LiveKit task result (e.g. appointment outcome)',
  })
  @IsOptional()
  @IsObject()
  taskResult?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description:
      'True only when the LiveKit task called complete_* (task.run() resolved). ' +
      'Omitted/false on a session-ended callback becomes status=incomplete. ' +
      'Do not infer from taskResult (NO_ANSWER / AGENT_ERROR also set that JSON).',
  })
  @IsOptional()
  @IsBoolean()
  taskCompleted?: boolean;

  @ApiPropertyOptional({
    type: 'array',
    description:
      'Worker tool invocations during the call (merged into sessionReport.toolEvents for portal). Include args, result, ok, error, summary, durationMs.',
    items: {
      type: 'object',
      properties: {
        at: { type: 'string' },
        toolId: { type: 'string' },
        ok: { type: 'boolean' },
        error: { type: 'string' },
        summary: { type: 'string' },
        durationMs: { type: 'number' },
        args: {},
        result: {},
      },
    },
  })
  @IsOptional()
  @IsArray()
  toolEvents?: Array<Record<string, unknown>> | null;

  @ApiPropertyOptional({
    example: 'no_answer',
    description:
      'Optional failure class for queue retry: no_answer | busy | sip_error | timeout | agent_error | cancelled | unknown',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  failureCode?: string | null;
}

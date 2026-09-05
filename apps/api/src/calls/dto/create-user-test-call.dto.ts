import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Org-user web test against an assigned organization agent.
 * Organization is taken from the JWT.
 */
export class CreateUserTestCallDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization-owned agent instance to test over LiveKit Meet',
  })
  @IsUUID()
  organizationAgentId!: string;

  @ApiPropertyOptional({
    example: 'demo_booking',
    description:
      'LiveKit task key. Defaults to the organization agent default task.',
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

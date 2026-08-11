import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Thin CRM body. Agent, task, trunk, and queue config come from the integration endpoint.
 */
export class PublicEnqueueCallDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'Destination number (E.164 preferred)',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  phoneNumber!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { customerName: 'Ada', bookingId: 'bk_123' },
    description:
      'Sparse runtime fields for the task. Merged over endpoint defaultContext. Never put executable code here.',
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'hubspot-deal-55',
    description: 'Optional CRM correlation id (stored in context.externalId)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;
}

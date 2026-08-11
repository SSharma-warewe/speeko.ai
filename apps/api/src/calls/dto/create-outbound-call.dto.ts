import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOutboundCallDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Organization-owned agent instance to use for the call',
  })
  @IsUUID()
  organizationAgentId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      phoneNumber: '+919876543210',
      customerName: 'Ada',
      bookingId: 'bk_123',
      appointmentTime: '2026-08-10T10:00:00Z',
    },
    description:
      'Runtime context for the task (CRM fields, booking details, etc.). phoneNumber is used when toNumber is omitted. Never put executable code here.',
  })
  @IsObject()
  context!: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'confirm_appointment',
    description:
      'LiveKit task key. Defaults to the organization agent default task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Override destination number (E.164 preferred)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  toNumber?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Local sip_trunks row id. Defaults to the org first active outbound trunk.',
  })
  @IsOptional()
  @IsUUID()
  sipTrunkId?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'If true, API blocks until the callee answers (slow; not ideal for continuous dialing). Default false.',
  })
  @IsOptional()
  @IsBoolean()
  waitUntilAnswered?: boolean;
}

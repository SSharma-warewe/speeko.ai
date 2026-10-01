import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import {
  CRM_ACTIONS,
  type CrmAction,
  type CrmCommand,
} from '@call-agent/contracts';

export class CrmCommandDto implements CrmCommand {
  @ApiProperty({ enum: CRM_ACTIONS })
  @IsIn(CRM_ACTIONS)
  action!: CrmAction;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Strict action parameters; unknown fields, URLs, tokens, and location overrides are rejected. See apps/api/src/crm/README.md.',
    example: { query: 'Ada', limit: 50 },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

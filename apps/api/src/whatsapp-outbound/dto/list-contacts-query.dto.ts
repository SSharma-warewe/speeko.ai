import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListContactsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;
  @ApiPropertyOptional({
    description:
      'An active org ghl_crm or ghl_contacts integration. Omit for the legacy contacts connection.',
  })
  @IsOptional()
  @IsUUID()
  integrationId?: string;
}

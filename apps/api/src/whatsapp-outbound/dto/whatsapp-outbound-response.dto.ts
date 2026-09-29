import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsAppTemplateVariableDto {
  @ApiProperty() key!: string;
  @ApiPropertyOptional({ nullable: true }) example!: string | null;
}

export class WhatsAppTemplateDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() language!: string;
  @ApiProperty() category!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ enum: ['POSITIONAL', 'NAMED'] })
  parameterFormat!: 'POSITIONAL' | 'NAMED';
  @ApiProperty() bodyText!: string;
  @ApiProperty({ type: [WhatsAppTemplateVariableDto] })
  bodyVariables!: WhatsAppTemplateVariableDto[];
  @ApiProperty() urlButtonVariable!: boolean;
  @ApiPropertyOptional({ nullable: true }) urlButtonIndex!: number | null;
  @ApiProperty() sendable!: boolean;
  @ApiPropertyOptional({ nullable: true }) unsendableReason!: string | null;
}

export class WhatsAppTemplatesResponseDto {
  @ApiProperty({ type: [WhatsAppTemplateDto] })
  templates!: WhatsAppTemplateDto[];
}

export class GhlContactRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) company!: string | null;
  @ApiProperty() dnd!: boolean;
}

export class GhlContactsResponseDto {
  @ApiProperty({ type: [GhlContactRowDto] })
  contacts!: GhlContactRowDto[];
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
  @ApiPropertyOptional({ nullable: true }) total!: number | null;
}

export class WhatsAppOutboundResultDto {
  @ApiPropertyOptional({ nullable: true }) name!: string | null;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true }) ghlContactId!: string | null;
  @ApiProperty({ enum: ['sent', 'failed', 'skipped'] })
  status!: 'sent' | 'failed' | 'skipped';
  @ApiPropertyOptional({ nullable: true }) wamid!: string | null;
  @ApiPropertyOptional({ nullable: true }) error!: string | null;
}

export class SendWhatsAppTemplateResponseDto {
  @ApiProperty({ format: 'uuid' }) batchKey!: string;
  @ApiProperty() sent!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty({ type: [WhatsAppOutboundResultDto] })
  results!: WhatsAppOutboundResultDto[];
}

export class WhatsAppOutboundMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) batchKey!: string;
  @ApiPropertyOptional({ nullable: true }) contactName!: string | null;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true }) ghlContactId!: string | null;
  @ApiProperty() templateName!: string;
  @ApiProperty() language!: string;
  @ApiProperty({ enum: ['sent', 'failed', 'skipped'] })
  status!: 'sent' | 'failed' | 'skipped';
  @ApiPropertyOptional({ nullable: true }) wamid!: string | null;
  @ApiPropertyOptional({ nullable: true }) error!: string | null;
  @ApiProperty() createdAt!: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CallCostLineDto {
  @ApiProperty({
    enum: [
      'llm',
      'stt',
      'tts',
      'webrtc',
      'sip',
      'agent_session',
      'krisp',
      'sip_vendor',
      'eot',
    ],
  })
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  model?: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({
    enum: [
      'tokens_in',
      'tokens_cached',
      'tokens_out',
      'minutes',
      'characters',
      'requests',
    ],
  })
  unit!: string;

  @ApiProperty({
    description:
      'Catalog rate: USD per minute, per 1M tokens, or per 1M characters depending on unit',
  })
  unitPriceUsd!: number;

  @ApiProperty()
  amountUsd!: number;

  @ApiPropertyOptional()
  notes?: string;
}

export class CallCostAttemptDto {
  @ApiProperty()
  attempt!: number;

  @ApiProperty()
  billedMinutes!: number;

  @ApiProperty()
  totalUsd!: number;

  @ApiProperty({ type: [CallCostLineDto] })
  lines!: CallCostLineDto[];

  @ApiProperty({ type: [String] })
  unknownModels!: string[];
}

export class CallCostSnapshotDto {
  @ApiProperty({ example: 'USD' })
  currency!: 'USD';

  @ApiProperty({ example: 0, description: 'Always 0 — list prices, no Speeko markup' })
  markup!: 0;

  @ApiProperty({ enum: ['build', 'ship', 'scale'] })
  plan!: string;

  @ApiProperty({ example: '2026-08-21' })
  catalogAsOf!: string;

  @ApiProperty()
  totalUsd!: number;

  @ApiProperty()
  billedMinutes!: number;

  @ApiProperty({ type: [String] })
  unknownModels!: string[];

  @ApiProperty({ type: [CallCostLineDto] })
  lines!: CallCostLineDto[];

  @ApiProperty({ type: [CallCostAttemptDto] })
  attempts!: CallCostAttemptDto[];
}

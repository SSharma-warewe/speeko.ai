import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestDemoResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiPropertyOptional({
    example: 'call-uuid',
    description: 'Enqueued call id when the integration response includes it',
  })
  callId?: string;
}

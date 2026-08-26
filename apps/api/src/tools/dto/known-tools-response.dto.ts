import { ApiProperty } from '@nestjs/swagger';

export class KnownToolsResponseDto {
  @ApiProperty({
    type: [String],
    example: ['endCall'],
    description: 'Worker tool registry ids',
  })
  toolIds!: string[];
}

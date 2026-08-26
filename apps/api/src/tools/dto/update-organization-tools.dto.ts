import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateOrganizationToolsDto {
  @ApiProperty({
    type: [String],
    example: ['endCall', 'scheduleGhlMeeting'],
    description:
      'Replace the org allowlist. Unknown ids rejected. endCall is always included.',
  })
  @IsArray()
  @IsString({ each: true })
  toolIds!: string[];
}

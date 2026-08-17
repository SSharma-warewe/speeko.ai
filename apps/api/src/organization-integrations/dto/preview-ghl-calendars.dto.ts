import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Unsaved GHL v3 PIT + location — lists calendars via GET /calendars/?locationId=. */
export class PreviewGhlCalendarsDto {
  @ApiProperty({
    description:
      'GoHighLevel v3 Private Integration Token (Bearer). Not a v1 API key.',
    example: 'pit-…',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey!: string;

  @ApiProperty({
    description:
      'GoHighLevel location (sub-account) id. Query param on GET /calendars/.',
    example: 've9EPM428h8vShlRW1KT',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationId!: string;
}

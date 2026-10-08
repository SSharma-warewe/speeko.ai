import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsObject, IsString, Length, Matches } from 'class-validator';
import {
  TTS_CACHE_NAMESPACE,
  type TtsCacheEnvelope,
  type TtsCacheLookupRequest,
  type TtsCachePublishRequest,
} from '@call-agent/contracts';

export class TtsCacheLookupDto implements TtsCacheLookupRequest {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @Length(1, 255)
  roomName!: string;
  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  digest!: string;
  @ApiProperty({ enum: [TTS_CACHE_NAMESPACE] })
  @Equals(TTS_CACHE_NAMESPACE)
  namespace!: typeof TTS_CACHE_NAMESPACE;
}
export class TtsCachePublishDto
  extends TtsCacheLookupDto
  implements TtsCachePublishRequest
{
  @ApiProperty({
    description:
      'Version 1 PCM s16le envelope; maximum 1 MiB decoded PCM/metadata and 15 seconds. Includes sampleRate, channels, durationSeconds, frames, pcmBase64 and SHA-256 checksum.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  envelope!: TtsCacheEnvelope;
}

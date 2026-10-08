import { createHash } from 'node:crypto';
import {
  TTS_CACHE_LIMITS,
  ttsCacheMetadata,
  type TtsCacheEnvelope,
  type TtsCacheMetadata,
} from '@call-agent/contracts';

export function decodeEnvelope(envelope: TtsCacheEnvelope) {
  const { metadata, pcmBytes } = ttsCacheMetadata(envelope);
  const pcm = Buffer.from(envelope.pcmBase64, 'base64');
  const json = JSON.stringify(metadata);
  const bytes =
    pcm.length + Buffer.byteLength(json) + metadata.frames.length * 64;
  if (
    pcm.length !== pcmBytes ||
    pcm.toString('base64') !== envelope.pcmBase64 ||
    bytes > TTS_CACHE_LIMITS.maxBytes ||
    createHash('sha256').update(json).update(pcm).digest('hex') !==
      envelope.checksum
  )
    throw new Error('Invalid TTS cache envelope');
  return { metadata, pcm, bytes, checksum: envelope.checksum };
}
export function encodeEnvelope(
  metadata: TtsCacheMetadata,
  pcm: Buffer,
  checksum: string,
): TtsCacheEnvelope {
  const envelope = { ...metadata, pcmBase64: pcm.toString('base64'), checksum };
  decodeEnvelope(envelope);
  return envelope;
}

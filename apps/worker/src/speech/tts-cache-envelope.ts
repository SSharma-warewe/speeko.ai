import { createHash } from 'node:crypto';
import {
  TTS_CACHE_LIMITS,
  TTS_CACHE_REVISION,
  ttsCacheMetadata,
  type TtsCacheEnvelope,
  type TtsCacheMetadata,
  type TtsCacheTiming,
} from '@call-agent/contracts';

export type StoredFrame = {
  data: Int16Array;
  sampleRate: number;
  channels: number;
  samplesPerChannel: number;
  timings: TtsCacheTiming[];
};
export type TtsCacheEntry = {
  frames: StoredFrame[];
  bytes: number;
  expires: number;
};

export function encodeCacheEntry(entry: TtsCacheEntry): TtsCacheEnvelope {
  const first = entry.frames[0];
  if (!first) throw new Error('Invalid TTS cache envelope');
  const metadata: TtsCacheMetadata = {
    revision: TTS_CACHE_REVISION,
    format: 'pcm-s16le',
    sampleRate: first.sampleRate,
    channels: first.channels,
    durationSeconds:
      entry.frames.reduce((n, f) => n + f.samplesPerChannel, 0) /
      first.sampleRate,
    frames: entry.frames.map((f) => {
      if (
        f.sampleRate !== first.sampleRate ||
        f.channels !== first.channels ||
        f.data.length !== f.samplesPerChannel * f.channels
      )
        throw new Error('Invalid TTS cache envelope');
      return { samplesPerChannel: f.samplesPerChannel, timings: f.timings };
    }),
  };
  const pcm = Buffer.alloc(
    entry.frames.reduce((n, f) => n + f.data.byteLength, 0),
  );
  let position = 0;
  for (const frame of entry.frames)
    for (const sample of frame.data) {
      pcm.writeInt16LE(sample, position);
      position += 2;
    }
  const envelope = {
    ...metadata,
    pcmBase64: pcm.toString('base64'),
    checksum: createHash('sha256')
      .update(JSON.stringify(metadata))
      .update(pcm)
      .digest('hex'),
  };
  // Canonicalization strips undefined optional fields consistently at both ends.
  const canonical = ttsCacheMetadata(envelope).metadata;
  envelope.checksum = createHash('sha256')
    .update(JSON.stringify(canonical))
    .update(pcm)
    .digest('hex');
  decodeCacheEntry(envelope, entry.expires);
  return envelope;
}
export function decodeCacheEntry(
  envelope: TtsCacheEnvelope,
  expires: number,
): TtsCacheEntry {
  const { metadata, pcmBytes } = ttsCacheMetadata(envelope);
  const pcm = Buffer.from(envelope.pcmBase64, 'base64');
  const json = JSON.stringify(metadata);
  const bytes =
    pcm.length + Buffer.byteLength(json) + metadata.frames.length * 64;
  if (
    !Number.isFinite(expires) ||
    pcm.length !== pcmBytes ||
    pcm.toString('base64') !== envelope.pcmBase64 ||
    bytes > TTS_CACHE_LIMITS.maxBytes ||
    createHash('sha256').update(json).update(pcm).digest('hex') !==
      envelope.checksum
  )
    throw new Error('Invalid TTS cache envelope');
  let position = 0;
  const frames = metadata.frames.map((f) => {
    const data = new Int16Array(f.samplesPerChannel * metadata.channels);
    for (let i = 0; i < data.length; i++) {
      data[i] = pcm.readInt16LE(position);
      position += 2;
    }
    return {
      data,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
      samplesPerChannel: f.samplesPerChannel,
      timings: f.timings,
    };
  });
  return { frames, bytes, expires };
}

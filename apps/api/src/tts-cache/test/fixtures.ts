import { createHash } from 'node:crypto';
import { ttsCacheMetadata, type TtsCacheEnvelope } from '@call-agent/contracts';
export function envelope(sample = 7, samples = 240): TtsCacheEnvelope {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(sample, i * 2);
  const e: TtsCacheEnvelope = {
    revision: 1,
    format: 'pcm-s16le',
    sampleRate: 24000,
    channels: 1,
    durationSeconds: samples / 24000,
    frames: [
      {
        samplesPerChannel: samples,
        timings: [{ text: 'Fixture', startTime: 0, endTime: samples / 24000 }],
      },
    ],
    pcmBase64: pcm.toString('base64'),
    checksum: '0'.repeat(64),
  };
  e.checksum = createHash('sha256')
    .update(JSON.stringify(ttsCacheMetadata(e).metadata))
    .update(pcm)
    .digest('hex');
  return e;
}

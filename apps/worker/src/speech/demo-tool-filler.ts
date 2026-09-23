import type { AgentJobMetadata } from '@call-agent/contracts';
import {
  demoBookLine,
  demoCheckLine,
  isOutboundDemoPipeline,
} from '../tasks/demo-booking-tracks.js';
import type { SessionUserData } from '../tools/types.js';
import { sayCached } from './tts-cache.js';

/**
 * Play the cached check/book sentence, overlap the HTTP, then wait for
 * playout so the next generateReply does not talk over the filler.
 * No-op on realtime, inbound, or other tasks.
 */
export async function withDemoToolFiller<T>(
  meta: AgentJobMetadata,
  userData: SessionUserData,
  kind: 'check' | 'book',
  fn: () => Promise<T>,
): Promise<T> {
  if (!isOutboundDemoPipeline(meta) || !userData.saySession) {
    return fn();
  }
  const line = kind === 'check' ? demoCheckLine(meta) : demoBookLine(meta);
  let handle: unknown;
  try {
    handle = sayCached(
      userData.saySession,
      userData.tts,
      line,
      { addToChatCtx: true, allowInterruptions: true },
      meta,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] demo tool filler say failed: ${message}`);
  }
  try {
    return await fn();
  } finally {
    await waitForSayPlayout(handle);
  }
}

export async function waitForSayPlayout(handle: unknown): Promise<void> {
  if (!handle || typeof handle !== 'object') {
    return;
  }
  const wait = (handle as { waitForPlayout?: unknown }).waitForPlayout;
  if (typeof wait !== 'function') {
    return;
  }
  try {
    await (wait as () => Promise<void>).call(handle);
  } catch {
    // Session may already be closing.
  }
}

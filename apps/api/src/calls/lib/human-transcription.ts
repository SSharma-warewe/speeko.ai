import type { HumanTranscriptionSummary } from '@call-agent/contracts';
import type { Call } from '../call.entity';

export type HumanTranscriptionState = HumanTranscriptionSummary & {
  jobId?: string;
  heartbeatAt: string;
  startedAt?: string;
  finishedAt?: string;
  audioDuration: number;
  listenerDuration: number;
  partial?: boolean;
};
export function humanTranscription(
  call: Pick<Call, 'sessionReport'>,
): HumanTranscriptionState | undefined {
  return call.sessionReport?.transcription as
    HumanTranscriptionState | undefined;
}
export function initializeHumanTranscription(call: Call): void {
  call.sessionReport = {
    ...call.sessionReport,
    transcription: {
      status: 'pending',
      provider: 'sarvam',
      model: 'saaras:v3-realtime',
      heartbeatAt: new Date().toISOString(),
      audioDuration: 0,
      listenerDuration: 0,
    } satisfies HumanTranscriptionState,
  };
}
export function endHumanTranscription(call: Call): void {
  const state = humanTranscription(call);
  if (!state || !['pending', 'running'].includes(state.status)) return;
  state.status = 'finalizing';
}

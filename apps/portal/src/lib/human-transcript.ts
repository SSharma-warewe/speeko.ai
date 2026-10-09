import type { CallRecord } from '@call-agent/contracts';

export function humanTranscriptMessage(call: CallRecord): string | null {
  if (call.executionType !== 'human') return null;
  if (!call.endedAt) return 'The transcript will be available after hang-up.';
  const status = call.humanCall?.transcription?.status;
  if (status === 'pending' || status === 'running' || status === 'finalizing')
    return 'Finishing the transcript…';
  if (status === 'partial')
    return 'Partial transcript — some speech could not be transcribed.';
  if (status === 'unavailable')
    return 'Transcription was unavailable for this call.';
  if (status === 'not_needed') return 'No connected audio to transcribe.';
  if (status === 'complete')
    return call.transcript?.length
      ? 'Transcript saved · Sarvam'
      : 'No speech was detected.';
  return 'No transcript was recorded for this call.';
}
export function shouldRefreshHumanTranscript(call: CallRecord | null): boolean {
  if (call?.executionType !== 'human' || !call.humanCall?.transcription)
    return false;
  if (!call.endedAt) return true;
  if (call.endedAt && Date.now() - Date.parse(call.endedAt) > 40000)
    return false;
  return ['pending', 'running', 'finalizing'].includes(
    call.humanCall.transcription.status,
  );
}

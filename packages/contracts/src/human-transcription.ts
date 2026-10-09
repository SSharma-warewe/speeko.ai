import type { CallTranscriptItem } from './call.js';

export type HumanTranscriptionStatus =
  | 'pending'
  | 'running'
  | 'finalizing'
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'not_needed';
export type HumanTranscriptionSummary = {
  status: HumanTranscriptionStatus;
  provider: 'sarvam';
  model: 'saaras:v3-realtime';
};
export type HumanTranscriptionJob = {
  mode: 'human_transcription';
  callId: string;
  roomName: string;
};
export type HumanTranscriptionStart = { roomName: string; jobId: string };
export type HumanTranscriptionStarted = {
  callbackToken: string;
  browserIdentity: string;
  sipIdentity: string;
};
export type HumanTranscriptionSegment = CallTranscriptItem & {
  id: string;
  role: 'caller' | 'contact';
  createdAt: string;
};
export type HumanTranscriptionCheckpoint = {
  jobId: string;
  callbackToken: string;
  segments: HumanTranscriptionSegment[];
  /** Cumulative measured provider audio seconds across both participants. */
  audioDuration: number;
  /** Cumulative time connected to LiveKit as a listener. */
  listenerDuration: number;
  partial?: boolean;
};
export type HumanTranscriptionFinish = HumanTranscriptionCheckpoint & {
  answered: boolean;
};

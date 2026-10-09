import { requiresOpeningPreparation, VOICE_TASK_STARTERS, type AgentJobMetadata } from '@call-agent/contracts';
import { JobMeta } from '../../session/job-metadata';

const meta: AgentJobMetadata = {
  agentKey: 'outbound', direction: 'outbound', medium: 'sip', task: 'general',
  prompt: { systemPrompt: 'Fixture', onEnterInstructions: 'Exact opening' },
  enabledTools: ['endCall'], ttsPreparedSpeechEnabled: true,
};
const gate = { version: 1 as const, attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deadline: Date.now() + 30000 };

describe('opening readiness wire and policy', () => {
  it('requires preparation for an exact outbound prepared opening', () => {
    expect(requiresOpeningPreparation(meta)).toBe(true);
  });
  it.each([
    { direction: 'inbound' }, { medium: 'web' }, { ttsPreparedSpeechEnabled: false },
    { model: 'openai/gpt-realtime-2.1' }, { prompt: { systemPrompt: 'Fixture', onEnterInstructions: '' } },
    { prompt: { systemPrompt: 'Fixture', onEnterInstructions: null } },
  ] as Partial<AgentJobMetadata>[])('preserves an excluded opening %j', extra => {
    expect(requiresOpeningPreparation({ ...meta, ...extra })).toBe(false);
  });
  it('gates a selected task opening even when background preparation is off, while task silence takes priority', () => {
    const taskMeta: AgentJobMetadata = { ...meta, voiceTask: {
      schemaVersion: 1, taskId: gate.attemptId, version: 1,
      definition: { ...VOICE_TASK_STARTERS.general, savedSpeech: {
        sentences: [{ key: 'opening', text: 'Task opening', whenToUse: 'Opening', prepare: false }],
        opening: { mode: 'sentence', key: 'opening' },
      } },
    } };
    expect(requiresOpeningPreparation(taskMeta)).toBe(true);
    taskMeta.voiceTask!.definition.savedSpeech!.opening = { mode: 'silent' };
    expect(requiresOpeningPreparation(taskMeta)).toBe(false);
  });
  it('preserves the valid gate through metadata parsing', () => {
    expect(new JobMeta().parseJobMetadata(JSON.stringify({ ...meta, openingPreparation: gate })).openingPreparation).toEqual(gate);
  });
  it.each([{ ...gate, version: 2 }, { ...gate, attemptId: 'invalid' }, { ...gate, deadline: 'late' }])('rejects malformed gating without falling back to an ungated job', invalid => {
    expect(() => new JobMeta().parseJobMetadata(JSON.stringify({ ...meta, openingPreparation: invalid }))).toThrow();
  });
});

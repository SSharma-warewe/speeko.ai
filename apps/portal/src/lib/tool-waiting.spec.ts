import {
  VOICE_TASK_STARTERS,
  compileVoiceTaskInstructions,
  conversationalSentences,
  voiceTaskDefinitionErrors,
  type VoiceTaskDefinition,
} from '@call-agent/contracts';
import {
  enableToolWaiting,
  setToolWaitingMessage,
  syncToolWaiting,
} from './tool-waiting';

const definition = (): VoiceTaskDefinition => ({
  ...structuredClone(VOICE_TASK_STARTERS.general),
  toolIds: [
    'checkGhlFreeSlots',
    'scheduleGhlMeeting',
    'upsertGhlContact',
    'endCall',
  ],
});

describe('tool waiting task settings', () => {
  it('opts in with pinned defaults and silent contact/hangup tools', () => {
    const original = definition();
    const d = enableToolWaiting(original, true);
    expect(original.savedSpeech).toBeUndefined();
    expect(voiceTaskDefinitionErrors(d)).toEqual([]);
    expect(d.savedSpeech!.toolWaiting!.tools.checkGhlFreeSlots).toMatchObject({
      mode: 'default',
      delayMs: 700,
    });
    expect(d.savedSpeech!.toolWaiting!.tools.scheduleGhlMeeting).toMatchObject({
      mode: 'default',
      delayMs: 400,
    });
    expect(d.savedSpeech!.toolWaiting!.tools.upsertGhlContact).toEqual({
      mode: 'off',
    });
    expect(d.savedSpeech!.toolWaiting!.tools.endCall).toEqual({ mode: 'off' });
    expect(conversationalSentences(d.savedSpeech)).toEqual([]);
    expect(compileVoiceTaskInstructions(d)).not.toContain('Let me check');
  });
  it('edits custom text/delay and preserves it across section disable/re-enable', () => {
    let d = enableToolWaiting(definition(), true);
    d = setToolWaitingMessage(d, 'scheduleGhlMeeting', 'custom', {
      text: 'Booking your visit.',
      delayMs: 1000,
    });
    const snapshot = structuredClone(d);
    d = enableToolWaiting(enableToolWaiting(d, false), true);
    expect(d).toEqual(snapshot);
    expect(voiceTaskDefinitionErrors(JSON.parse(JSON.stringify(d)))).toEqual(
      [],
    );
    d = setToolWaitingMessage(d, 'scheduleGhlMeeting', 'default');
    expect(
      d.savedSpeech!.sentences.find(
        (s) => s.key === 'waiting_scheduleGhlMeeting',
      )!.text,
    ).toBe('I’m booking that time for you now.');
    expect(
      snapshot.savedSpeech!.sentences.find(
        (s) => s.key === 'waiting_scheduleGhlMeeting',
      )!.text,
    ).toBe('Booking your visit.');
  });
  it('removes deselected tool mappings and sentences; adds recommendations for newly selected tools', () => {
    const d = enableToolWaiting(definition(), true);
    const next = syncToolWaiting({
      ...d,
      toolIds: ['scheduleGhlMeeting', 'listCalendarEvents'],
    });
    expect(
      next.savedSpeech!.toolWaiting!.tools.checkGhlFreeSlots,
    ).toBeUndefined();
    expect(
      next.savedSpeech!.sentences.some(
        (s) => s.key === 'waiting_checkGhlFreeSlots',
      ),
    ).toBe(false);
    expect(
      next.savedSpeech!.toolWaiting!.tools.listCalendarEvents,
    ).toMatchObject({ mode: 'default', delayMs: 700 });
    expect(voiceTaskDefinitionErrors(next)).toEqual([]);
    expect(d.savedSpeech!.toolWaiting!.tools.checkGhlFreeSlots).toBeDefined();
  });
  it.each([
    [
      'unselected tool',
      (d: ReturnType<typeof definition>) => {
        d.toolIds = ['endCall'];
      },
    ],
    [
      'invalid delay',
      (d: ReturnType<typeof definition>) => {
        (d.savedSpeech!.toolWaiting!.tools.checkGhlFreeSlots as any).delayMs =
          0;
      },
    ],
    [
      'empty text',
      (d: ReturnType<typeof definition>) => {
        d.savedSpeech!.sentences[0].text = ' ';
      },
    ],
    [
      'hook reference',
      (d: ReturnType<typeof definition>) => {
        d.savedSpeech!.opening = {
          mode: 'sentence',
          key: d.savedSpeech!.sentences[0].key,
        };
      },
    ],
    [
      'phase reference',
      (d: ReturnType<typeof definition>) => {
        d.phases[0].sentenceKeys = [d.savedSpeech!.sentences[0].key];
      },
    ],
    [
      'extra property',
      (d: ReturnType<typeof definition>) => {
        (d.savedSpeech!.toolWaiting as any).code = 'run()';
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const d = enableToolWaiting(definition(), true);
    mutate(d);
    expect(voiceTaskDefinitionErrors(d).length).toBeGreaterThan(0);
  });
});

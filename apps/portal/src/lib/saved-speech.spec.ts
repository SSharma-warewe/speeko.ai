import { VOICE_TASK_STARTERS } from '@call-agent/contracts';
import { renameSentence, sentenceReferenced } from './saved-speech';

describe('saved speech editor references', () => {
  const definition = () =>
    structuredClone(VOICE_TASK_STARTERS.real_estate_receptionist);
  it('detects phase and hook references and updates both on rename', () => {
    const d = definition();
    d.savedSpeech!.opening = { mode: 'sentence', key: 'buy_location' };
    d.savedSpeech!.closing = { mode: 'sentence', key: 'buy_location' };
    expect(sentenceReferenced(d, 'buy_location')).toBe(true);
    const renamed = renameSentence(d, 'buy_location', 'ask_area');
    expect(renamed.savedSpeech!.sentences[0].key).toBe('ask_area');
    expect(renamed.phases[0].sentenceKeys).toContain('ask_area');
    expect(renamed.savedSpeech!.opening).toEqual({
      mode: 'sentence',
      key: 'ask_area',
    });
    expect(renamed.savedSpeech!.closing).toEqual({
      mode: 'sentence',
      key: 'ask_area',
    });
    expect(sentenceReferenced(renamed, 'buy_location')).toBe(false);
    expect(d.savedSpeech!.sentences[0].key).toBe('buy_location');
  });
  it('permits removing only unreferenced sentences and preserves legacy definitions', () => {
    const d = definition();
    d.phases = [];
    expect(sentenceReferenced(d, 'buy_location')).toBe(false);
    expect(renameSentence(VOICE_TASK_STARTERS.general, 'x', 'y')).toBe(
      VOICE_TASK_STARTERS.general,
    );
  });
  it('lets users correct a temporary duplicate key without renaming both rows', () => {
    const d = definition();
    d.savedSpeech!.sentences[1].key = d.savedSpeech!.sentences[0].key;
    const fixed = renameSentence(d, 'buy_location', 'rent_location', 1);
    expect(fixed.savedSpeech!.sentences[0].key).toBe('buy_location');
    expect(fixed.savedSpeech!.sentences[1].key).toBe('rent_location');
    expect(fixed.phases[0].sentenceKeys).toContain('buy_location');
  });
});

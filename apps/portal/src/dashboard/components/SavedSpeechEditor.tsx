import { Button, Field, Input, Select, Textarea } from '@call-agent/ui';
import {
  SAVED_SPEECH_MAX_SENTENCES,
  type VoiceTaskDefinition,
  type SavedSentence,
  type SavedSpeechHook,
} from '@call-agent/contracts';
import { renameSentence, sentenceReferenced } from '../../lib/saved-speech';

export function SavedSpeechEditor({
  definition,
  onChange,
}: {
  definition: VoiceTaskDefinition;
  onChange: (value: VoiceTaskDefinition) => void;
}) {
  const speech = definition.savedSpeech ?? { sentences: [] };
  const visibleIndices = speech.sentences.flatMap((s, i) =>
    s.purpose === 'toolWaiting' ? [] : [i],
  );
  const patch = (change: Partial<typeof speech>) =>
    onChange({ ...definition, savedSpeech: { ...speech, ...change } });
  const update = (i: number, change: Partial<SavedSentence>) =>
    patch({
      sentences: speech.sentences.map((s, n) =>
        n === i ? { ...s, ...change } : s,
      ),
    });
  const choose = (value: string): SavedSpeechHook =>
    value === 'agent' || value === 'silent'
      ? { mode: value }
      : { mode: 'sentence', key: value.slice(9) };
  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>Saved speech</h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={speech.sentences.length >= SAVED_SPEECH_MAX_SENTENCES}
          onClick={() => {
            let n = 1;
            while (speech.sentences.some((s) => s.key === `sentence_${n}`)) n++;
            patch({
              sentences: [
                ...speech.sentences,
                {
                  key: `sentence_${n}`,
                  text: '',
                  whenToUse: '',
                  prepare: true,
                },
              ],
            });
          }}
        >
          Add sentence
        </Button>
      </div>
      <div className="ops-panel-body ops-stack">
        <p className="ops-muted">
          Define up to 20 fixed sentences. Your agent requests a key to speak
          its exact wording. Preparation runs during calls when the agent’s
          Prepared sentences setting is On. Native speech-to-speech uses wording
          guidance without cached audio. Variable placeholders are unsupported.
        </p>
        {(['opening', 'closing'] as const).map((kind) => {
          const hook = speech[kind];
          const value =
            hook?.mode === 'sentence'
              ? `sentence:${hook.key}`
              : (hook?.mode ?? 'agent');
          return (
            <Field
              key={kind}
              label={kind === 'opening' ? 'Opening speech' : 'Closing speech'}
            >
              <Select
                aria-label={`${kind} speech`}
                value={value}
                onChange={(e) => patch({ [kind]: choose(e.target.value) })}
              >
                <option value="agent">Agent default</option>
                <option value="silent">Silent</option>
                {speech.sentences
                  .filter((s) => s.key && s.purpose !== 'toolWaiting')
                  .map((s, i) => (
                    <option key={i} value={`sentence:${s.key}`}>
                      Saved sentence: {s.key}
                    </option>
                  ))}
              </Select>
            </Field>
          );
        })}
        {!visibleIndices.length && (
          <p className="ops-muted">
            No saved sentences. Existing generated speech and agent hooks
            continue unchanged.
          </p>
        )}
        {visibleIndices.map((i) => {
          const sentence = speech.sentences[i];
          return (
            <fieldset key={i} className="voice-task-card">
              <legend>Sentence {i + 1}</legend>
              <Field label="Key">
                <Input
                  aria-label={`Sentence ${i + 1} key`}
                  maxLength={64}
                  value={sentence.key}
                  onChange={(e) =>
                    onChange(
                      renameSentence(
                        definition,
                        sentence.key,
                        e.target.value,
                        i,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Exact text">
                <Textarea
                  aria-label={`Sentence ${i + 1} text`}
                  rows={3}
                  maxLength={500}
                  value={sentence.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                />
              </Field>
              <Field label="When to use">
                <Textarea
                  aria-label={`Sentence ${i + 1} usage`}
                  rows={2}
                  maxLength={1000}
                  value={sentence.whenToUse}
                  onChange={(e) => update(i, { whenToUse: e.target.value })}
                />
              </Field>
              <label className="voice-task-option">
                <input
                  type="checkbox"
                  aria-label={`Prepare sentence ${i + 1}`}
                  checked={sentence.prepare}
                  onChange={(e) => update(i, { prepare: e.target.checked })}
                />{' '}
                Prepare audio during calls
              </label>
              <div className="ops-chip-row">
                {[-1, 1].map((delta) => (
                  <Button
                    key={delta}
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Move sentence ${i + 1} ${delta < 0 ? 'up' : 'down'}`}
                    disabled={
                      visibleIndices.indexOf(i) + delta < 0 ||
                      visibleIndices.indexOf(i) + delta >= visibleIndices.length
                    }
                    onClick={() => {
                      const sentences = [...speech.sentences];
                      const target =
                        visibleIndices[visibleIndices.indexOf(i) + delta];
                      [sentences[i], sentences[target]] = [
                        sentences[target],
                        sentences[i],
                      ];
                      patch({ sentences });
                    }}
                  >
                    {delta < 0 ? 'Move up' : 'Move down'}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="dangerGhost"
                  disabled={sentenceReferenced(definition, sentence.key)}
                  onClick={() =>
                    patch({
                      sentences: speech.sentences.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove sentence
                </Button>
              </div>
              {sentenceReferenced(definition, sentence.key) && (
                <p className="ops-muted">
                  Clear opening, closing, and phase references before removing
                  this sentence.
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

import { SegmentedControl, Select, Slider } from "@call-agent/ui";
import {
  extraVoiceCatalog,
  parseTtsModel,
  ttsModelSpec,
  voiceCatalog,
  TTS_MODEL_OPTIONS,
  type DeliveryMode,
  type TtsModelId,
} from "../../lib/voices";
import { DEFAULT_TTS_MODEL_ID } from "@call-agent/contracts";

export type AgentVoiceValues = {
  ttsModel: string | null;
  voice: string | null;
  speakingRate: number;
  deliveryMode: DeliveryMode;
  temperature: number;
};

type Props = AgentVoiceValues & {
  disabled?: boolean;
  compact?: boolean;
  onChange: (next: Partial<AgentVoiceValues>) => void;
};

const DELIVERY_OPTIONS: { value: DeliveryMode; label: string }[] = [
  { value: "STABLE", label: "Stable" },
  { value: "BALANCED", label: "Balanced" },
  { value: "CREATIVE", label: "Creative" },
];

function switchTtsModel(nextId: TtsModelId): Partial<AgentVoiceValues> {
  const spec = ttsModelSpec(nextId);
  return {
    ttsModel: nextId === DEFAULT_TTS_MODEL_ID ? null : nextId,
    voice: nextId === DEFAULT_TTS_MODEL_ID ? null : spec.defaultVoice,
  };
}

export function AgentVoiceRack({
  ttsModel,
  voice,
  speakingRate,
  deliveryMode,
  temperature,
  disabled = false,
  compact = false,
  onChange,
}: Props) {
  const selectedModel = parseTtsModel(ttsModel);
  const spec = ttsModelSpec(selectedModel);
  const voices = voiceCatalog(selectedModel, voice);
  const extraVoices = extraVoiceCatalog(selectedModel);
  const voiceValue = voice ?? "";

  const modelControl = (
    <SegmentedControl
      aria-label="Speech model"
      value={selectedModel}
      options={TTS_MODEL_OPTIONS.map((opt) => ({ ...opt, disabled }))}
      onChange={(value) => onChange(switchTtsModel(value))}
    />
  );

  if (compact) {
    return (
      <div className="ops-voice-compact">
        <label className="ops-voice-compact-label" htmlFor="agent-tts-model">
          Speech model
        </label>
        <div id="agent-tts-model">{modelControl}</div>
        <label className="ops-voice-compact-label" htmlFor="agent-voice-select">
          Voice
        </label>
        <Select
          id="agent-voice-select"
          value={voiceValue}
          disabled={disabled}
          onChange={(e) =>
            onChange({ voice: e.target.value ? e.target.value : null })
          }
        >
          {voices.map((v) => (
            <option key={v.storedId ?? "default"} value={v.storedId ?? ""}>
              {v.name} — {v.line}
            </option>
          ))}
        </Select>
        {spec.controls.speakingRate ? (
          <Slider
            label="Speaking speed"
            value={speakingRate}
            min={0.5}
            max={1.5}
            step={0.05}
            unit="×"
            ticks={5}
            disabled={disabled}
            hint={
              spec.id === DEFAULT_TTS_MODEL_ID
                ? "1.0 is the native Inworld rate."
                : "1.0 is the native speaking rate."
            }
            onChange={(value) =>
              onChange({ speakingRate: Math.round(value * 100) / 100 })
            }
          />
        ) : null}
        {spec.controls.deliveryMode ? (
          <div
            className={
              disabled
                ? "ops-voice-delivery ops-voice-delivery--compact is-disabled"
                : "ops-voice-delivery ops-voice-delivery--compact"
            }
          >
            <span className="ops-voice-delivery-label">Delivery</span>
            <SegmentedControl
              aria-label="TTS delivery mode"
              value={deliveryMode}
              options={DELIVERY_OPTIONS}
              onChange={(value) => onChange({ deliveryMode: value })}
            />
            <p className="ops-voice-delivery-hint">
              TTS variation. Reply temperature is the LLM, not the voice.
            </p>
          </div>
        ) : null}
        <Slider
          label="Reply temperature"
          value={temperature}
          min={0}
          max={2}
          step={0.1}
          ticks={5}
          disabled={disabled}
          hint="LLM randomness. 0 is precise, 2 is loose."
          onChange={(value) =>
            onChange({ temperature: Math.round(value * 10) / 10 })
          }
        />
      </div>
    );
  }

  return (
    <div className="ops-voice-rack">
      <div className="ops-voice-cast">
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">Speech model</span>
          <span className="ops-desk-hint">{spec.label}</span>
        </div>
        {modelControl}
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">Talent</span>
          <span className="ops-desk-hint">{spec.shortLabel}</span>
        </div>
        <div className="ops-voice-tiles" role="listbox" aria-label="Voice">
          {voices
            .filter((v) => {
              if (v.storedId === null) return true;
              if (extraVoices.length === 0) return true;
              return !extraVoices.some((x) => x.id === v.id);
            })
            .map((v) => {
              const selected =
                v.storedId === null ? voice === null : voice === v.storedId;
              return (
                <button
                  key={v.storedId ?? "default"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    selected ? "ops-voice-tile is-on" : "ops-voice-tile"
                  }
                  disabled={disabled}
                  onClick={() => onChange({ voice: v.storedId })}
                >
                  <span className="ops-voice-tile-mark" aria-hidden>
                    {v.initial}
                  </span>
                  <span className="ops-voice-tile-copy">
                    <span className="ops-voice-tile-name">{v.name}</span>
                    <span className="ops-voice-tile-line">{v.line}</span>
                  </span>
                </button>
              );
            })}
        </div>
        {extraVoices.length > 0 ? (
          <Select
            aria-label="More voices"
            value={
              extraVoices.some((v) => v.id === voice) ? (voice ?? "") : ""
            }
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onChange({ voice: e.target.value });
            }}
          >
            <option value="">More voices…</option>
            {extraVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.line}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <div className="ops-voice-mix">
        {spec.controls.speakingRate ? (
          <Slider
            label="Speaking speed"
            value={speakingRate}
            min={0.5}
            max={1.5}
            step={0.05}
            unit="×"
            ticks={5}
            disabled={disabled}
            hint="0.5 is half pace · 1.0 native · 1.5 rushed"
            onChange={(value) =>
              onChange({ speakingRate: Math.round(value * 100) / 100 })
            }
          />
        ) : null}

        {spec.controls.deliveryMode ? (
          <div
            className={
              disabled ? "ops-voice-delivery is-disabled" : "ops-voice-delivery"
            }
          >
            <span className="ops-voice-delivery-label">Delivery</span>
            <SegmentedControl
              aria-label="TTS delivery mode"
              value={deliveryMode}
              options={DELIVERY_OPTIONS}
              onChange={(value) => onChange({ deliveryMode: value })}
            />
            <p className="ops-voice-delivery-hint">
              Stable is even. Creative lets the voice wander. TTS-2 ignores
              temperature here.
            </p>
          </div>
        ) : null}

        <Slider
          label="Reply temperature"
          value={temperature}
          min={0}
          max={2}
          step={0.1}
          ticks={5}
          disabled={disabled}
          hint="LLM only — not TTS. 0 precise · 0.7 typical · 2 loose"
          onChange={(value) =>
            onChange({ temperature: Math.round(value * 10) / 10 })
          }
        />
      </div>
    </div>
  );
}

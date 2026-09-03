import { SegmentedControl, Select, Slider } from "@call-agent/ui";
import {
  extraRealtimeVoiceCatalog,
  extraVoiceCatalog,
  parseLlmModel,
  parseTtsModel,
  realtimeVoiceCatalog,
  ttsModelSpec,
  voiceCatalog,
  PIPELINE_LLM_OPTIONS,
  REALTIME_LLM_OPTIONS,
  TTS_MODEL_OPTIONS,
  DEFAULT_LLM_MODEL,
  DEFAULT_REALTIME_MODEL,
  isRealtimeLlmModel,
  llmModelSpec,
  type DeliveryMode,
  type LlmModelId,
  type TtsModelId,
} from "../../lib/voices";
import { DEFAULT_TTS_MODEL_ID } from "@call-agent/contracts";

export type AgentVoiceValues = {
  model: string | null;
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

type PipelineMode = "pipeline" | "realtime";

function switchTtsModel(nextId: TtsModelId): Partial<AgentVoiceValues> {
  const spec = ttsModelSpec(nextId);
  return {
    ttsModel: nextId === DEFAULT_TTS_MODEL_ID ? null : nextId,
    voice: nextId === DEFAULT_TTS_MODEL_ID ? null : spec.defaultVoice,
  };
}

function switchLlmModel(nextId: LlmModelId): Partial<AgentVoiceValues> {
  const spec = llmModelSpec(nextId);
  if (spec.kind === "realtime") {
    return {
      model: nextId,
      ttsModel: null,
      voice: spec.defaultVoice,
    };
  }
  return {
    model: nextId === DEFAULT_LLM_MODEL ? null : nextId,
  };
}

function switchMode(next: PipelineMode): Partial<AgentVoiceValues> {
  if (next === "realtime") {
    return switchLlmModel(DEFAULT_REALTIME_MODEL);
  }
  return {
    model: null,
    ttsModel: null,
    voice: null,
  };
}

export function AgentVoiceRack({
  model,
  ttsModel,
  voice,
  speakingRate,
  deliveryMode,
  temperature,
  disabled = false,
  compact = false,
  onChange,
}: Props) {
  const realtime = isRealtimeLlmModel(model);
  const selectedLlm = parseLlmModel(model);
  const llmSpec = llmModelSpec(selectedLlm);
  const selectedTts = parseTtsModel(ttsModel);
  const ttsSpec = ttsModelSpec(selectedTts);
  const voices = realtime
    ? realtimeVoiceCatalog(selectedLlm, voice)
    : voiceCatalog(selectedTts, voice);
  const extraVoices = realtime
    ? extraRealtimeVoiceCatalog(selectedLlm)
    : extraVoiceCatalog(selectedTts);
  const voiceValue = voice ?? "";
  const showTemperature = !realtime && llmSpec.controls.temperature;
  const speechHint = realtime ? llmSpec.label : ttsSpec.label;

  const modeControl = (
    <SegmentedControl
      aria-label="Voice pipeline"
      value={realtime ? "realtime" : "pipeline"}
      options={[
        { value: "pipeline", label: "Pipeline", disabled },
        { value: "realtime", label: "Realtime", disabled },
      ]}
      onChange={(value) => onChange(switchMode(value as PipelineMode))}
    />
  );

  const llmControl = realtime ? (
    <SegmentedControl
      aria-label="Realtime model"
      value={selectedLlm}
      options={REALTIME_LLM_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        disabled,
      }))}
      onChange={(value) => onChange(switchLlmModel(value as LlmModelId))}
    />
  ) : (
    <Select
      id="agent-llm-select"
      aria-label="Language model"
      value={selectedLlm}
      disabled={disabled}
      onChange={(e) => onChange(switchLlmModel(e.target.value as LlmModelId))}
    >
      {PIPELINE_LLM_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );

  const ttsControl = (
    <SegmentedControl
      aria-label="Speech model"
      value={selectedTts}
      options={TTS_MODEL_OPTIONS.map((opt) => ({ ...opt, disabled }))}
      onChange={(value) => onChange(switchTtsModel(value as TtsModelId))}
    />
  );

  const voiceSelect = (
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
  );

  const mixSliders = (
    <>
      {!realtime && ttsSpec.controls.speakingRate ? (
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
            ttsSpec.id === DEFAULT_TTS_MODEL_ID
              ? "1.0 is the native Inworld rate."
              : "1.0 is the native speaking rate."
          }
          onChange={(value) =>
            onChange({ speakingRate: Math.round(value * 100) / 100 })
          }
        />
      ) : null}
      {!realtime && ttsSpec.controls.deliveryMode ? (
        <div
          className={
            disabled
              ? compact
                ? "ops-voice-delivery ops-voice-delivery--compact is-disabled"
                : "ops-voice-delivery is-disabled"
              : compact
                ? "ops-voice-delivery ops-voice-delivery--compact"
                : "ops-voice-delivery"
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
            {compact
              ? "TTS variation. Reply temperature is the LLM, not the voice."
              : "Stable is even. Creative lets the voice wander. TTS-2 ignores temperature here."}
          </p>
        </div>
      ) : null}
      {showTemperature ? (
        <Slider
          label="Reply temperature"
          value={temperature}
          min={0}
          max={2}
          step={0.1}
          ticks={5}
          disabled={disabled}
          hint={
            compact
              ? "LLM randomness. 0 is precise, 2 is loose."
              : "LLM only — not TTS. 0 precise · 0.7 typical · 2 loose"
          }
          onChange={(value) =>
            onChange({ temperature: Math.round(value * 10) / 10 })
          }
        />
      ) : null}
    </>
  );

  if (compact) {
    return (
      <div className="ops-voice-compact">
        <label className="ops-voice-compact-label">Pipeline</label>
        <div>{modeControl}</div>
        <label className="ops-voice-compact-label" htmlFor="agent-llm-select">
          {realtime ? "Realtime model" : "Language model"}
        </label>
        <div>{llmControl}</div>
        {realtime ? (
          <p className="ops-desk-hint">
            Native speech-to-speech — no separate TTS.
          </p>
        ) : (
          <>
            <label className="ops-voice-compact-label" htmlFor="agent-tts-model">
              Speech model
            </label>
            <div id="agent-tts-model">{ttsControl}</div>
          </>
        )}
        <label className="ops-voice-compact-label" htmlFor="agent-voice-select">
          Voice
        </label>
        {voiceSelect}
        {mixSliders}
      </div>
    );
  }

  return (
    <div className="ops-voice-rack">
      <div className="ops-voice-cast">
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">Pipeline</span>
          <span className="ops-desk-hint">
            {realtime ? "Speech-to-speech" : "STT · LLM · TTS"}
          </span>
        </div>
        {modeControl}
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">
            {realtime ? "Realtime model" : "Language model"}
          </span>
          <span className="ops-desk-hint">{llmSpec.shortLabel}</span>
        </div>
        {llmControl}
        {realtime ? (
          <p className="ops-desk-hint">
            Native speech-to-speech — no STT or TTS picker. Talent below is
            the realtime voice, not Inworld.
          </p>
        ) : (
          <>
            <div className="ops-voice-cast-head">
              <span className="ops-desk-kicker">Speech model</span>
              <span className="ops-desk-hint">{speechHint}</span>
            </div>
            {ttsControl}
          </>
        )}
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">Talent</span>
          <span className="ops-desk-hint">
            {realtime ? llmSpec.shortLabel : ttsSpec.shortLabel}
          </span>
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

      <div className="ops-voice-mix">{mixSliders}</div>
    </div>
  );
}

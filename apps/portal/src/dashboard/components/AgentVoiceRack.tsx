import type { ReactNode } from "react";
import { SegmentedControl, Select, Slider } from "@call-agent/ui";
import {
  extraRealtimeVoiceCatalog,
  extraVoiceCatalog,
  parseLlmModel,
  parseSpeechLanguage,
  parseSttModel,
  parseTtsModel,
  realtimeVoiceCatalog,
  sttModelSpec,
  ttsModelSpec,
  voiceCatalog,
  PIPELINE_LLM_OPTIONS,
  REALTIME_LLM_OPTIONS,
  STT_LANGUAGE_OPTIONS,
  STT_MODEL_OPTIONS,
  TTS_LANGUAGE_OPTIONS,
  TTS_MODEL_OPTIONS,
  DEFAULT_LLM_MODEL,
  DEFAULT_REALTIME_MODEL,
  isRealtimeLlmModel,
  isSarvamSttModel,
  isSarvamTtsModel,
  llmModelSpec,
  type DeliveryMode,
  type LlmModelId,
  type SttModelId,
  type TtsModelId,
} from "../../lib/voices";
import {
  DEFAULT_STT_MODEL_ID,
  DEFAULT_TTS_MODEL_ID,
} from "@call-agent/contracts";

export type AgentVoiceValues = {
  model: string | null;
  ttsModel: string | null;
  sttModel: string | null;
  speechLanguage: string | null;
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

function switchSttModel(nextId: SttModelId): Partial<AgentVoiceValues> {
  return {
    sttModel: nextId === DEFAULT_STT_MODEL_ID ? null : nextId,
  };
}

function switchLlmModel(nextId: LlmModelId): Partial<AgentVoiceValues> {
  const spec = llmModelSpec(nextId);
  if (spec.kind === "realtime") {
    return {
      model: nextId,
      ttsModel: null,
      sttModel: null,
      speechLanguage: null,
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
    sttModel: null,
    speechLanguage: null,
    voice: null,
  };
}

function VoiceStage({
  kicker,
  hint,
  span,
  children,
}: {
  kicker: string;
  hint?: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={span ? "ops-voice-stage is-span" : "ops-voice-stage"}>
      <div className="ops-voice-cast-head">
        <span className="ops-desk-kicker">{kicker}</span>
        {hint ? <span className="ops-desk-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function CompactField({
  label,
  htmlFor,
  span,
  children,
}: {
  label: string;
  htmlFor?: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        span ? "ops-voice-compact-field is-span" : "ops-voice-compact-field"
      }
    >
      <label className="ops-voice-compact-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ModelChips<T extends string>({
  options,
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ops-voice-models" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? "ops-voice-model is-on" : "ops-voice-model"}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function AgentVoiceRack({
  model,
  ttsModel,
  sttModel,
  speechLanguage,
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
  const selectedStt = parseSttModel(sttModel);
  const sttSpec = sttModelSpec(selectedStt);
  const selectedLanguage = parseSpeechLanguage(speechLanguage);
  const showSpeechLanguage =
    !realtime && (isSarvamTtsModel(selectedTts) || isSarvamSttModel(selectedStt));
  const languageOptions = isSarvamSttModel(selectedStt)
    ? STT_LANGUAGE_OPTIONS
    : TTS_LANGUAGE_OPTIONS;
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
    compact ? (
      <Select
        id="agent-llm-select"
        aria-label="Realtime model"
        value={selectedLlm}
        disabled={disabled}
        onChange={(e) => onChange(switchLlmModel(e.target.value as LlmModelId))}
      >
        {REALTIME_LLM_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    ) : (
      <ModelChips
        ariaLabel="Realtime model"
        value={selectedLlm}
        disabled={disabled}
        options={REALTIME_LLM_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        onChange={(value) => onChange(switchLlmModel(value))}
      />
    )
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

  const ttsControl = compact ? (
    <Select
      id="agent-tts-select"
      aria-label="Speech model"
      value={selectedTts}
      disabled={disabled}
      onChange={(e) => onChange(switchTtsModel(e.target.value as TtsModelId))}
    >
      {TTS_MODEL_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  ) : (
    <ModelChips
      ariaLabel="Speech model"
      value={selectedTts}
      disabled={disabled}
      options={TTS_MODEL_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }))}
      onChange={(value) => onChange(switchTtsModel(value))}
    />
  );

  const sttControl = compact ? (
    <SegmentedControl
      aria-label="Listen model"
      value={selectedStt}
      options={STT_MODEL_OPTIONS.map((opt) => ({ ...opt, disabled }))}
      onChange={(value) => onChange(switchSttModel(value as SttModelId))}
    />
  ) : (
    <ModelChips
      ariaLabel="Listen model"
      value={selectedStt}
      disabled={disabled}
      options={STT_MODEL_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }))}
      onChange={(value) => onChange(switchSttModel(value))}
    />
  );

  const languageControl = (
    <Select
      id="agent-speech-language"
      aria-label="Speech language"
      value={selectedLanguage ?? ""}
      disabled={disabled}
      onChange={(e) =>
        onChange({ speechLanguage: e.target.value ? e.target.value : null })
      }
    >
      <option value="">Default</option>
      {languageOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
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
        <CompactField label="Pipeline">{modeControl}</CompactField>
        <CompactField
          label={realtime ? "Realtime model" : "Language model"}
          htmlFor="agent-llm-select"
        >
          {llmControl}
        </CompactField>
        {realtime ? (
          <p className="ops-desk-hint ops-voice-compact-note">
            Native speech-to-speech — no separate TTS.
          </p>
        ) : (
          <>
            <CompactField label="Listen">{sttControl}</CompactField>
            <CompactField label="Speech model" htmlFor="agent-tts-select">
              {ttsControl}
            </CompactField>
            {showSpeechLanguage ? (
              <CompactField
                span
                label="Language"
                htmlFor="agent-speech-language"
              >
                {languageControl}
              </CompactField>
            ) : null}
          </>
        )}
        <CompactField span label="Voice" htmlFor="agent-voice-select">
          {voiceSelect}
        </CompactField>
        <div className="ops-voice-compact-mix">{mixSliders}</div>
      </div>
    );
  }

  const featuredVoices = voices.filter((v) => {
    if (v.storedId === null) return true;
    if (extraVoices.length === 0) return true;
    return !extraVoices.some((x) => x.id === v.id);
  });

  return (
    <div className="ops-voice-rack">
      <div className="ops-voice-strip">
        <span className="ops-desk-kicker">Signal</span>
        {modeControl}
        <span className="ops-desk-hint">
          {realtime ? "Speech-to-speech" : "Listen · think · speak"}
        </span>
      </div>

      {realtime ? (
        <div className="ops-voice-stages is-realtime">
          <VoiceStage kicker="Realtime model" hint={llmSpec.shortLabel} span>
            {llmControl}
            <p className="ops-voice-stage-note">
              Native speech-to-speech — no STT or TTS picker. Talent below is
              the realtime voice, not Inworld.
            </p>
          </VoiceStage>
        </div>
      ) : (
        <div
          className={
            showSpeechLanguage
              ? "ops-voice-stages is-language"
              : "ops-voice-stages"
          }
        >
          <VoiceStage kicker="Listen" hint={sttSpec.label}>
            {sttControl}
          </VoiceStage>
          <VoiceStage kicker="Think" hint={llmSpec.shortLabel}>
            {llmControl}
          </VoiceStage>
          <VoiceStage kicker="Speak" hint={speechHint}>
            {ttsControl}
          </VoiceStage>
          {showSpeechLanguage ? (
            <VoiceStage kicker="Language" hint="Sarvam STT / Bulbul TTS">
              {languageControl}
            </VoiceStage>
          ) : null}
        </div>
      )}

      <div className="ops-voice-cast">
        <div className="ops-voice-cast-head">
          <span className="ops-desk-kicker">Talent</span>
          <span className="ops-desk-hint">
            {realtime ? llmSpec.shortLabel : ttsSpec.shortLabel}
          </span>
        </div>
        <div className="ops-voice-tiles" role="listbox" aria-label="Voice">
          {featuredVoices.map((v) => {
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

import { SegmentedControl, Select, Slider } from "@call-agent/ui";
import { type DeliveryMode, voiceCatalog } from "../../lib/voices";

export type AgentVoiceValues = {
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

export function AgentVoiceRack({
  voice,
  speakingRate,
  deliveryMode,
  temperature,
  disabled = false,
  compact = false,
  onChange,
}: Props) {
  const voices = voiceCatalog(voice);

  if (compact) {
    return (
      <div className="ops-voice-compact">
        <label className="ops-voice-compact-label" htmlFor="agent-voice-select">
          Voice
        </label>
        <Select
          id="agent-voice-select"
          value={voice ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onChange({ voice: e.target.value ? e.target.value : null })
          }
        >
          {voices.map((v) => (
            <option key={v.id ?? "default"} value={v.id ?? ""}>
              {v.name} — {v.line}
            </option>
          ))}
        </Select>
        <Slider
          label="Speaking speed"
          value={speakingRate}
          min={0.5}
          max={1.5}
          step={0.05}
          unit="×"
          ticks={5}
          disabled={disabled}
          hint="1.0 is the native Inworld rate."
          onChange={(value) =>
            onChange({ speakingRate: Math.round(value * 100) / 100 })
          }
        />
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
          <span className="ops-desk-kicker">Cast</span>
          <span className="ops-desk-hint">Inworld TTS-2</span>
        </div>
        <div className="ops-voice-tiles" role="listbox" aria-label="Voice">
          {voices.map((v) => {
            const selected =
              v.id === null ? voice === null : voice === v.id;
            return (
              <button
                key={v.id ?? "default"}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected ? "ops-voice-tile is-on" : "ops-voice-tile"
                }
                disabled={disabled}
                onClick={() => onChange({ voice: v.id })}
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
      </div>

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

      <div className={disabled ? "ops-voice-delivery is-disabled" : "ops-voice-delivery"}>
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
  );
}

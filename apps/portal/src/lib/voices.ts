import { DELIVERY_MODES, type DeliveryMode } from "@call-agent/contracts";

export { DELIVERY_MODES, type DeliveryMode };

export type AgentVoiceOption = {
  /** null = worker pin (Ashley). */
  id: string | null;
  name: string;
  line: string;
  initial: string;
};

/** Inworld voices documented for LiveKit Inference. Stored as the voice name. */
export const AGENT_VOICES: AgentVoiceOption[] = [
  { id: null, name: "Default", line: "Ashley · worker pin", initial: "★" },
  { id: "Ashley", name: "Ashley", line: "Warm American", initial: "A" },
  { id: "Edward", name: "Edward", line: "Emphatic American", initial: "E" },
  { id: "Olivia", name: "Olivia", line: "Upbeat British", initial: "O" },
  { id: "Diego", name: "Diego", line: "Gentle Mexican", initial: "D" },
  { id: "Luna", name: "Luna", line: "Chill American", initial: "L" },
  { id: "Ara", name: "Ara", line: "Warm, friendly", initial: "R" },
  { id: "Sarah", name: "Sarah", line: "Clear American", initial: "S" },
  { id: "Clive", name: "Clive", line: "Measured British", initial: "C" },
];

export const DEFAULT_SPEAKING_RATE = 1;
export const DEFAULT_DELIVERY_MODE: DeliveryMode = "BALANCED";
export const DEFAULT_TEMPERATURE = 0.7;

export function parseDeliveryMode(value: string | null | undefined): DeliveryMode {
  if (value === "STABLE" || value === "BALANCED" || value === "CREATIVE") {
    return value;
  }
  return DEFAULT_DELIVERY_MODE;
}

export function voiceCatalog(current: string | null): AgentVoiceOption[] {
  if (
    current &&
    !AGENT_VOICES.some((v) => v.id !== null && v.id === current)
  ) {
    return [
      ...AGENT_VOICES,
      {
        id: current,
        name: current,
        line: "Custom",
        initial: current.slice(0, 1).toUpperCase() || "?",
      },
    ];
  }
  return AGENT_VOICES;
}

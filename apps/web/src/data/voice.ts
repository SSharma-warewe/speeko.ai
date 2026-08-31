/**
 * Marketing voice catalog. Names and lines stay in sync with
 * `apps/portal/src/lib/voices.ts` (`AGENT_VOICES`, excluding Default / worker pin).
 */

export type VoiceTalent = {
  id: string;
  name: string;
  line: string;
  initial: string;
};

export const VOICE_TALENT: VoiceTalent[] = [
  { id: "Ashley", name: "Ashley", line: "Warm American", initial: "A" },
  { id: "Edward", name: "Edward", line: "Emphatic American", initial: "E" },
  { id: "Olivia", name: "Olivia", line: "Upbeat British", initial: "O" },
  { id: "Diego", name: "Diego", line: "Gentle Mexican", initial: "D" },
  { id: "Luna", name: "Luna", line: "Chill American", initial: "L" },
  { id: "Ara", name: "Ara", line: "Warm, friendly", initial: "R" },
  { id: "Sarah", name: "Sarah", line: "Clear American", initial: "S" },
  { id: "Clive", name: "Clive", line: "Measured British", initial: "C" },
];

export const VOICE_DEFAULT_ID = "Ashley";
export const VOICE_DEFAULT_RATE = 1;
export const VOICE_RATE_MIN = 0.5;
export const VOICE_RATE_MAX = 1.5;

export const DELIVERY_MODES = [
  { id: "STABLE", label: "Stable", hint: "Even, the same every time." },
  { id: "BALANCED", label: "Balanced", hint: "Natural variation." },
  { id: "CREATIVE", label: "Creative", hint: "Lets the voice wander." },
] as const;

export type DeliveryId = (typeof DELIVERY_MODES)[number]["id"];

export const VOICE_SAMPLE =
  "Hi, this is the clinic calling about tomorrow’s visit. Is this a good time?";

export const HANGUP_SIDES = [
  {
    id: "robot",
    kicker: "IVR",
    title: "They already know.",
    ink: true,
    beats: [
      "One metallic speed. A tree of numbers.",
      "It cannot be interrupted. Wait for the beep.",
      "Same voice on every number, every clinic.",
    ],
  },
  {
    id: "person",
    kicker: "Speeko",
    title: "They stay.",
    ink: false,
    beats: [
      "A named agent. Neural speech you pick.",
      "They talk over it — it listens.",
      "Opening line you wrote. Pace and delivery you set.",
    ],
  },
] as const;

export const VOICE_WALK = [
  "Open the agent in the portal — the same desk as the system prompt.",
  "Switch Persona to Voice.",
  "Pick talent, speaking speed, and delivery. Save. The next call uses it.",
] as const;

export const PERSONA_ROWS = [
  {
    dt: "System prompt",
    dd: "Who it is — company, tone, policies. Not the workflow.",
  },
  {
    dt: "On start",
    dd: "Opening instructions, or silent. Empty = built-in greeting.",
  },
  {
    dt: "On end",
    dd: "A closing line, spoken as written — or silent.",
  },
] as const;

export const INTERRUPT_CARDS = [
  {
    kicker: "01",
    title: "Talk over it.",
    body: "The caller does not wait for a beep. If they cut in, the agent stops and listens.",
  },
  {
    kicker: "02",
    title: "Not a recording.",
    body: "It answers what they said, not the next menu item. The call is a conversation.",
  },
  {
    kicker: "03",
    title: "Same agent, every ring.",
    body: "Voice, pace, and persona live on the config. Inbound and outbound use the same desk.",
  },
] as const;

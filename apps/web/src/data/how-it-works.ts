import { TOOL_IDS, type KnownToolId } from "@call-agent/contracts";

export type HowStepId = "number" | "agents" | "tools" | "persona" | "live";

export type HowStep = {
  id: HowStepId;
  n: string;
  kicker: string;
  title: string;
  lead: string;
  beats: string[];
};

export const HOW_STEPS: HowStep[] = [
  {
    id: "number",
    n: "01",
    kicker: "Number",
    title: "Bring a virtual number.",
    lead: "The number lives at Telnyx, Twilio, or your SIP carrier. Speeko does not sell it. You connect the one you already have so the agent can dial out and take rings.",
    beats: [
      "Paste the phone number in the portal (E.164, like +1…).",
      "Outbound: provision with the provider address (sip.telnyx.com) and optional SIP auth — live as soon as you save. Or link a trunk you already have.",
      "Inbound: save a draft, publish, then point the provider at Speeko for that number.",
    ],
  },
  {
    id: "agents",
    n: "02",
    kicker: "Agents",
    title: "Inbound and outbound, named.",
    lead: "Each agent is a named config from a platform template — not a human role. You can have many of each: different names, prompts, and voices.",
    beats: [
      "Create from the inbound or outbound template. Give it a name and a slug.",
      "Inbound requires a default task — what a ring is for.",
      "Outbound leaves the job for the call, the batch, or the CRM endpoint.",
      "Voice, speaking speed, and delivery sit on the agent (or fall back to the template).",
    ],
  },
  {
    id: "tools",
    n: "03",
    kicker: "Tools",
    title: "A profile, then how it sounds.",
    lead: "A tool profile is a pick of verbs the worker already knows. Hangup is always on. Calendar and GoHighLevel only fire if that connection is on the agent.",
    beats: [
      "Assemble a profile from hangup, lookup, confirm, calendar, transfer — whatever this agent is allowed to finish.",
      "Attach the profile to the agent. Leave a verb off and it cannot do that on the call.",
      "Set voice, speaking speed, and delivery on the same agent. Speech is the persona; tools are the outcome.",
    ],
  },
  {
    id: "persona",
    n: "04",
    kicker: "Persona",
    title: "Write the prompts.",
    lead: "The system prompt is who it is — company, tone, policies. Not the workflow. Jobs stay in tasks. Opening and closing are separate lines.",
    beats: [
      "System prompt: identity only. Do not encode “call John, then ask these five questions.”",
      "On start: opening instructions, or silent.",
      "On end: a closing line, spoken as written — or silent.",
    ],
  },
  {
    id: "live",
    n: "05",
    kicker: "Live",
    title: "Two doors out.",
    lead: "Outbound goes live when a CRM posts a number, or when you enqueue from the desk. Inbound goes live when a dispatch rule is published on a number you already pointed at Speeko.",
    beats: [
      "CRM integration: bake the outbound agent, the task, and the trunk. One API key. The CRM sends the phone number. The queue dials.",
      "Inbound dispatch: attach live inbound trunks and the inbound agent. Publish. That number rings that persona.",
    ],
  },
];

export const HOW_PROFILE_IDS: KnownToolId[] = [
  TOOL_IDS.endCall,
  TOOL_IDS.lookupCustomer,
  TOOL_IDS.confirmAppointment,
  TOOL_IDS.checkCalendarAvailability,
  TOOL_IDS.transferCall,
];

export const HOW_DOORS = [
  {
    id: "integration",
    kicker: "Outbound",
    title: "CRM integration",
    body: "Bake the agent, the task, and the outbound trunk into an endpoint. Copy the API key once. Your CRM posts a phone number — optional context, no agent fields. The queue claims and dials.",
    beats: ["Agent + task + trunk, fixed", "CRM sends the phone number", "Queue dials under your concurrency"],
  },
  {
    id: "dispatch",
    kicker: "Inbound",
    title: "Dispatch rule",
    body: "Attach the live inbound trunks and the inbound agent. Publish. The provider already points that number here — a ring opens a room with that persona and its default task.",
    beats: ["Live inbound trunks + agent", "Publish the rule", "The number rings that desk"],
  },
] as const;

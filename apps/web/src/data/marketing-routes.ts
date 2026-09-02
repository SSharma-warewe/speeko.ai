/** Public marketing origin. Canonicals always point here, never localhost. */
export const MARKETING_ORIGIN = "https://speeko.ai";

export type MarketingRoute = {
  path: string;
  title: string;
  description: string;
  priority: number;
};

export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: "/",
    title: "Speeko — Voice agents for calls",
    description:
      "Speeko places and answers calls for appointment confirmations and lead outreach — with live transcripts, real-time outcomes, and zero missed follow-ups.",
    priority: 1.0,
  },
  {
    path: "/get-demo",
    title: "Get a demo — Speeko",
    description:
      "See Speeko voice agents handle real inbound and outbound calls. Request a live walkthrough tailored to your volume and stack.",
    priority: 0.9,
  },
  {
    path: "/how-it-works",
    title: "How it works — Speeko",
    description:
      "Bring a virtual number from Telnyx, Twilio, or your SIP carrier. Name the agents, switch on tools, and take a persona live — no code.",
    priority: 0.8,
  },
  {
    path: "/voice",
    title: "Voice that people stay on — Speeko",
    description:
      "Speeko agents use neural speech you pick on the agent — talent, pace, delivery — so the first second does not sound like an IVR.",
    priority: 0.8,
  },
  {
    path: "/solutions",
    title: "Solutions — Speeko",
    description:
      "Agents only run tools you enable — hang up, look someone up, check a calendar, book, cancel, transfer. Assemble a profile. You do not upload code.",
    priority: 0.8,
  },
  {
    path: "/solutions/customer-service",
    title: "Customer Service tools — Speeko",
    description:
      "Assemble a clinic agent from hangup, lookup, confirm, calendar, and transfer. Speeko voice agents finish the visit, not the voicemail.",
    priority: 0.7,
  },
  {
    path: "/solutions/marketing-sales",
    title: "Marketing & Sales tools — Speeko",
    description:
      "A demo-setter profile: GHL contact tools, free slots, and schedule. Qualification is the task; the tools are how a meeting actually lands.",
    priority: 0.7,
  },
  {
    path: "/ai-voice-agent",
    title: "AI Voice Agent for Inbound & Outbound Calls — Speeko",
    description:
      "Speeko is an AI voice agent for phone calls: inbound answering and outbound dials, with tools to look someone up, book, confirm, transfer, and hang up.",
    priority: 0.9,
  },
  {
    path: "/appointment-confirmation-calls",
    title: "Appointment Confirmation Calls — Speeko",
    description:
      "AI appointment confirmation calls that confirm, reschedule, or cancel while the person is on the line — then write the outcome back to your book.",
    priority: 0.85,
  },
  {
    path: "/ai-receptionist",
    title: "AI Receptionist for Inbound Calls — Speeko",
    description:
      "An AI receptionist that answers inbound calls, looks the caller up, takes the job it can finish, and transfers the rest to a human.",
    priority: 0.85,
  },
  {
    path: "/outbound-ai-calling",
    title: "Outbound AI Calling — Speeko",
    description:
      "Outbound AI calling with a real dial queue: concurrency limits, retries on no-answer and busy, and tasks for outreach, qualification, and demo booking.",
    priority: 0.85,
  },
  {
    path: "/ai-calling-for-clinics",
    title: "AI Calling for Clinics — Speeko",
    description:
      "Clinic appointment confirmation calls on the number you already have. Speeko agents confirm, move, or cancel visits without replacing your EHR.",
    priority: 0.85,
  },
];

export const MARKETING_PATHS = new Set(
  MARKETING_ROUTES.map((route) => route.path),
);

export const KEYWORD_PATHS = [
  "/ai-voice-agent",
  "/appointment-confirmation-calls",
  "/ai-receptionist",
  "/outbound-ai-calling",
  "/ai-calling-for-clinics",
] as const;

export type KeywordPath = (typeof KEYWORD_PATHS)[number];

export function marketingUrl(path: string): string {
  return path === "/" ? `${MARKETING_ORIGIN}/` : `${MARKETING_ORIGIN}${path}`;
}

export function marketingRouteByPath(
  path: string,
): MarketingRoute | undefined {
  return MARKETING_ROUTES.find((route) => route.path === path);
}

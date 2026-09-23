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
    title: "Speeko — AI Voice Agents for Inbound & Outbound Calls",
    description:
      "Speeko places and answers calls for appointment confirmations and lead outreach — with live transcripts, real-time outcomes, and zero missed follow-ups.",
    priority: 1.0,
  },
  {
    path: "/get-demo",
    title: "Get a Speeko Demo — See AI Voice Agents Handle Calls",
    description:
      "See Speeko voice agents handle real inbound and outbound calls. Request a live walkthrough tailored to your volume and stack.",
    priority: 0.9,
  },
  {
    path: "/how-it-works",
    title: "How Speeko Works — From a Number to a Live Voice Agent",
    description:
      "Bring a virtual number from Telnyx, Twilio, or your SIP carrier. Name the agents, switch on tools, and take a persona live — no code.",
    priority: 0.8,
  },
  {
    path: "/voice",
    title: "Neural Voice That People Stay On — Speeko AI Agents",
    description:
      "Speeko agents use neural speech you pick on the agent — talent, pace, delivery — so the first second does not sound like an IVR.",
    priority: 0.8,
  },
  {
    path: "/solutions",
    title: "Speeko Solutions — AI Calling Agents and WhatsApp",
    description:
      "Two services: AI calling agents that place and answer calls, and WhatsApp that follows Meta’s template and 24-hour window rules.",
    priority: 0.8,
  },
  {
    path: "/solutions/ai-calling-agents",
    title: "AI Calling Agents — Speeko Inbound and Outbound",
    description:
      "Speeko AI calling agents answer and place calls, then write the outcome with the tools you enable — confirm, book, transfer, or hang up.",
    priority: 0.7,
  },
  {
    path: "/solutions/whatsapp-services",
    title: "WhatsApp Services — Templates and the 24-Hour Window — Speeko",
    description:
      "WhatsApp on Speeko follows Meta’s Cloud API: approved marketing, utility, and authentication templates, plus replies inside the customer service window.",
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
    title: "AI Appointment Confirmation Calls — Speeko Voice Agents",
    description:
      "AI appointment confirmation calls that confirm, reschedule, or cancel while the person is on the line — then write the outcome back to your book.",
    priority: 0.85,
  },
  {
    path: "/ai-receptionist",
    title: "AI Receptionist for Inbound Calls — Speeko Voice Agents",
    description:
      "An AI receptionist that answers inbound calls, looks the caller up, takes the job it can finish, and transfers the rest to a human.",
    priority: 0.85,
  },
  {
    path: "/outbound-ai-calling",
    title: "Outbound AI Calling with Dial Queue & Retries — Speeko",
    description:
      "Outbound AI calling with a real dial queue: concurrency limits, retries on no-answer and busy, and tasks for outreach, qualification, and demo booking.",
    priority: 0.85,
  },
  {
    path: "/ai-calling-for-clinics",
    title: "AI Calling for Clinics — Speeko Appointment Confirmations",
    description:
      "Clinic appointment confirmation calls on the number you already have. Speeko agents confirm, move, or cancel visits without replacing your EHR.",
    priority: 0.85,
  },
];

export const MARKETING_PATHS = new Set(
  MARKETING_ROUTES.map((route) => route.path),
);

/** Old public paths. Not in the sitemap. Static shells redirect; React does too. */
export const MARKETING_REDIRECTS: { from: string; to: string }[] = [
  {
    from: "/solutions/customer-service",
    to: "/solutions/ai-calling-agents",
  },
  {
    from: "/solutions/marketing-sales",
    to: "/solutions/ai-calling-agents",
  },
];

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

import { TOOL_IDS, type KnownToolId } from "@call-agent/contracts";

export type ToolGroupId = "call" | "appointments" | "calendar" | "ghl";

export type ToolCopy = {
  id: KnownToolId;
  group: ToolGroupId;
  /** Chip / chain label. Defaults to `id`. */
  shortId?: string;
  /** Short verb for the composer sentence. */
  verb: string;
  label: string;
  does: string;
  accomplishes: string;
  scene: string;
};

export const TOOL_GROUPS: { id: ToolGroupId; title: string; hint: string }[] = [
  { id: "call", title: "Call control", hint: "How the session ends or hands off" },
  { id: "appointments", title: "Appointments", hint: "Confirm, book, or cancel a visit" },
  { id: "calendar", title: "Calendar", hint: "Nylas — live free/busy and events" },
  { id: "ghl", title: "GoHighLevel", hint: "Contacts + open slots + meetings" },
];

export const TOOL_COPY: ToolCopy[] = [
  {
    id: TOOL_IDS.endCall,
    group: "call",
    verb: "hang up when the job is done",
    label: "Hang up",
    does: "Ends the voice session and deletes the LiveKit room, which drops the SIP leg. Every profile includes this — you cannot build an agent that cannot hang up.",
    accomplishes: "The line is clear the moment the caller is finished, declines, or asks you to stop. No orphan rooms holding a concurrent dial slot.",
    scene: "“That’s all, thank you.” → hang up → room gone.",
  },
  {
    id: TOOL_IDS.transferCall,
    group: "call",
    verb: "hand the caller to a human",
    label: "Transfer",
    does: "Requests a transfer to a department or queue when the caller needs a live person.",
    accomplishes: "A billing dispute, a clinical question, or an angry caller leaves the agent and lands on your team — with a reason attached.",
    scene: "Duplicate charge the agent cannot reverse → transfer to billing.",
  },
  {
    id: TOOL_IDS.lookupCustomer,
    group: "appointments",
    verb: "look up the caller",
    label: "Lookup",
    does: "Searches by phone, email, or name. Prefers fields already on the call (CRM context) so the agent does not re-ask what you already know.",
    accomplishes: "The agent greets Elena by name and cites the right visit, instead of treating every ring as a stranger.",
    scene: "Inbound from +1 415… → found Elena Vasquez, Dr. Patel 9:30.",
  },
  {
    id: TOOL_IDS.confirmAppointment,
    group: "appointments",
    verb: "write confirm / reschedule / cancel back to the book",
    label: "Confirm appointment",
    does: "Persists CONFIRMED, RESCHEDULED, or CANCELLED against a booking id, with an optional new time.",
    accomplishes: "Tomorrow’s list is actually worked: kept, moved, or dropped — not a voicemail that staff have to replay.",
    scene: "“Yes, I’ll be there.” → CONFIRMED on booking bk_19f.",
  },
  {
    id: TOOL_IDS.booking,
    group: "appointments",
    verb: "record a new booking",
    label: "Book",
    does: "Creates a booking once the person has agreed to a specific time. Name, time, notes.",
    accomplishes: "A new patient who called after hours leaves with a slot, not a “someone will call you back.”",
    scene: "Agreed Thursday 2:00 → booking id issued on the call.",
  },
  {
    id: TOOL_IDS.cancelBooking,
    group: "appointments",
    verb: "cancel an existing booking",
    label: "Cancel booking",
    does: "Cancels a booking the caller no longer needs.",
    accomplishes: "The slot is freed the same minute they say they cannot make it — not after a no-show.",
    scene: "“I need to cancel Tuesday.” → booking cancelled, list updated.",
  },
  {
    id: TOOL_IDS.checkCalendarAvailability,
    shortId: "CalendarAvailability",
    group: "calendar",
    verb: "check which times are actually free",
    label: "Check availability",
    does: "Asks the linked Nylas calendar whether a proposed window is open. The agent is not allowed to invent a free slot.",
    accomplishes: "It only offers times that are empty. No double-books, no “I’ll put you down and hope.”",
    scene: "Caller wants Thursday afternoon → 2:00 and 4:15 come back open.",
  },
  {
    id: TOOL_IDS.listCalendarEvents,
    group: "calendar",
    verb: "list what is already on the calendar",
    label: "List events",
    does: "Reads upcoming events on the linked Nylas calendar for a window.",
    accomplishes: "The agent can say “you already have Dr. Nguyen at 2” instead of stacking a second visit.",
    scene: "Same-day callback → sees the 2:00 already holds.",
  },
  {
    id: TOOL_IDS.createCalendarEvent,
    group: "calendar",
    verb: "put a real event on the calendar",
    label: "Create event",
    does: "Creates the event only after availability said the slot was free. Title, time, email when known.",
    accomplishes: "The demo or visit exists on the calendar before the agent claims it is booked.",
    scene: "Slot free → event “Visit — Priya Shah” created → then it says you’re booked.",
  },
  {
    id: TOOL_IDS.cancelCalendarEvent,
    group: "calendar",
    verb: "remove an event it created",
    label: "Cancel event",
    does: "Deletes or cancels a Nylas event by id.",
    accomplishes: "A caller who changes their mind frees the time on the real calendar, not just in the transcript.",
    scene: "“Scratch that Thursday.” → event cancelled, 2:00 is open again.",
  },
  {
    id: TOOL_IDS.checkGhlFreeSlots,
    group: "ghl",
    verb: "read GoHighLevel open slots",
    label: "GHL free slots",
    does: "Returns open times only from the org’s GHL calendar. Existing appointments are never shown to the agent.",
    accomplishes: "A demo setter offers real holes in the calendar — not a busy hour dressed up as available.",
    scene: "Thursday morning → 10:00 and 11:30 come back as open times.",
  },
  {
    id: TOOL_IDS.lookupGhlContact,
    group: "ghl",
    verb: "find the GoHighLevel contact",
    label: "GHL lookup",
    does: "Looks up a contact by email or phone and stores the GHL id on the call when found.",
    accomplishes: "Booking can proceed without creating a duplicate contact — the meeting attaches to the person you already have.",
    scene: "sofia@brightline.care → contact found, id saved on the call.",
  },
  {
    id: TOOL_IDS.upsertGhlContact,
    group: "ghl",
    verb: "create or update the GoHighLevel contact",
    label: "GHL upsert",
    does: "Writes name, email, and phone into GHL and keeps the contact id on the call. Does not invent an email.",
    accomplishes: "A new lead who has never been in GHL still gets a contact before the meeting is placed.",
    scene: "No contact yet → upsert “Marcus Hale” → now schedule can run.",
  },
  {
    id: TOOL_IDS.scheduleGhlMeeting,
    group: "ghl",
    verb: "book the GoHighLevel meeting",
    label: "GHL book meeting",
    does: "Places the appointment on the linked GHL calendar. Needs a real contact id — it does not create contacts. Will not claim booked unless the tool returns ok.",
    accomplishes: "The demo is on the GHL calendar, on the right contact, at a slot that was actually free.",
    scene: "Contact id + 10:00 open → meeting created → “you’re booked Thursday at 10.”",
  },
];

export const TOOL_BY_ID: Record<KnownToolId, ToolCopy> = Object.fromEntries(
  TOOL_COPY.map((t) => [t.id, t]),
) as Record<KnownToolId, ToolCopy>;

export function toolChip(id: KnownToolId): string {
  return TOOL_BY_ID[id]?.shortId ?? id;
}

export type ProfileKind = "platform" | "custom";

export type ToolProfileExample = {
  key: string;
  name: string;
  kind: ProfileKind;
  toolIds: KnownToolId[];
  accomplishes: string;
};

export const PROFILE_EXAMPLES: ToolProfileExample[] = [
  {
    key: "default",
    name: "Default",
    kind: "platform",
    toolIds: [TOOL_IDS.endCall],
    accomplishes: "Talk, then hang up. The seeded inbound starter — no calendar, no book.",
  },
  {
    key: "outbound",
    name: "Outbound",
    kind: "platform",
    toolIds: [
      TOOL_IDS.endCall,
      TOOL_IDS.booking,
      TOOL_IDS.cancelBooking,
      TOOL_IDS.transferCall,
      TOOL_IDS.lookupCustomer,
      TOOL_IDS.confirmAppointment,
    ],
    accomplishes:
      "Work a list: look someone up, confirm or cancel, book a new time, or hand off to a human.",
  },
  {
    key: "after-hours",
    name: "After-hours clinic",
    kind: "custom",
    toolIds: [
      TOOL_IDS.endCall,
      TOOL_IDS.lookupCustomer,
      TOOL_IDS.checkCalendarAvailability,
      TOOL_IDS.createCalendarEvent,
      TOOL_IDS.transferCall,
    ],
    accomplishes: "Answer after close, greet a known patient, offer a real free slot, or escalate.",
  },
  {
    key: "demo-setter",
    name: "Demo setter",
    kind: "custom",
    toolIds: [
      TOOL_IDS.endCall,
      TOOL_IDS.lookupGhlContact,
      TOOL_IDS.upsertGhlContact,
      TOOL_IDS.checkGhlFreeSlots,
      TOOL_IDS.scheduleGhlMeeting,
    ],
    accomplishes: "Find or create the GHL contact, read open times, book the demo, hang up.",
  },
];

export function describeProfile(ids: readonly string[]): string {
  const selected = TOOL_COPY.filter(
    (t) => ids.includes(t.id) && t.id !== TOOL_IDS.endCall,
  );
  if (selected.length === 0) {
    return "This agent can talk, then hang up. Add tools to let it act on the call.";
  }
  const verbs = selected.map((t) => t.verb);
  if (verbs.length === 1) {
    return `This agent can ${verbs[0]} — then hang up.`;
  }
  const head = verbs.slice(0, -1).join(", ");
  const last = verbs[verbs.length - 1];
  return `This agent can ${head}, and ${last} — then hang up.`;
}

export type Playbook = {
  id: string;
  title: string;
  job: string;
  toolIds: KnownToolId[];
  accomplishes: string;
  beats: { toolId: KnownToolId | null; text: string }[];
};

export type SolutionSlug = "customer-service" | "marketing-sales";

export type SolutionLane = {
  slug: SolutionSlug;
  title: string;
  documentTitle: string;
  kicker: string;
  headline: string;
  lead: string;
  playbooks: Playbook[];
  starterIds: KnownToolId[];
  helps: { kicker: string; title: string; body: string }[];
  other: { slug: SolutionSlug; title: string; body: string };
};

export const LANES: Record<SolutionSlug, SolutionLane> = {
  "customer-service": {
    slug: "customer-service",
    title: "Customer Service",
    documentTitle: "Customer Service tools — Speeko",
    kicker: "Customer Service",
    headline: "Tools that finish the visit, not the voicemail.",
    lead: "Assemble a clinic agent from hangup, lookup, confirm, calendar, and transfer. The agent can only do what you switch on.",
    starterIds: [
      TOOL_IDS.endCall,
      TOOL_IDS.lookupCustomer,
      TOOL_IDS.confirmAppointment,
      TOOL_IDS.checkCalendarAvailability,
      TOOL_IDS.createCalendarEvent,
      TOOL_IDS.transferCall,
    ],
    helps: [
      {
        kicker: "Nights",
        title: "The visit is booked before morning",
        body: "A 9pm inbound can still look the caller up, offer a slot the calendar said was free, and hang up. Staff do not replay a voicemail.",
      },
      {
        kicker: "Lists",
        title: "Confirmations write back to the book",
        body: "Kept, moved, or dropped is a tool result on the booking id — not a note in the transcript for someone to type later.",
      },
    ],
    playbooks: [
      {
        id: "confirm-list",
        title: "Work tomorrow’s list",
        job: "Outbound confirmations",
        toolIds: [TOOL_IDS.lookupCustomer, TOOL_IDS.confirmAppointment, TOOL_IDS.endCall],
        accomplishes:
          "Each patient is greeted by name, the visit is kept or moved, and the book is updated before the agent hangs up.",
        beats: [
          { toolId: TOOL_IDS.lookupCustomer, text: "Match the number to Elena Vasquez, Dr. Patel 9:30." },
          { toolId: null, text: "Ask if the slot still works." },
          { toolId: TOOL_IDS.confirmAppointment, text: "Write CONFIRMED (or RESCHEDULED / CANCELLED) on the booking." },
          { toolId: TOOL_IDS.endCall, text: "Hang up. The list row is done." },
        ],
      },
      {
        id: "after-hours",
        title: "Book after hours",
        job: "Inbound, calendar on",
        toolIds: [
          TOOL_IDS.checkCalendarAvailability,
          TOOL_IDS.createCalendarEvent,
          TOOL_IDS.endCall,
        ],
        accomplishes:
          "A swollen-knee call at 9pm leaves with Thursday at 2:00 on the calendar — only after the slot checked free.",
        beats: [
          { toolId: null, text: "Answer. Ask morning vs afternoon." },
          { toolId: TOOL_IDS.checkCalendarAvailability, text: "Thursday afternoon → 2:00 and 4:15 are open." },
          { toolId: TOOL_IDS.createCalendarEvent, text: "Create “Visit — Priya Shah” at 2:00. Then say it’s booked." },
          { toolId: TOOL_IDS.endCall, text: "Hang up. No callback ticket." },
        ],
      },
      {
        id: "escalate",
        title: "Escalate what the agent cannot close",
        job: "Inbound support",
        toolIds: [TOOL_IDS.lookupCustomer, TOOL_IDS.transferCall, TOOL_IDS.endCall],
        accomplishes:
          "A duplicate-charge call is identified, then handed to billing instead of looping on a script.",
        beats: [
          { toolId: TOOL_IDS.lookupCustomer, text: "Find Marcus Hale and the July 8 visit." },
          { toolId: null, text: "The hold looks like a dispute, not a simple confirm." },
          { toolId: TOOL_IDS.transferCall, text: "Request billing, with the reason." },
          { toolId: TOOL_IDS.endCall, text: "If they decline the transfer, hang up cleanly." },
        ],
      },
      {
        id: "cancel-slot",
        title: "Free a cancelled slot",
        job: "Inbound or outbound",
        toolIds: [TOOL_IDS.cancelBooking, TOOL_IDS.cancelCalendarEvent, TOOL_IDS.endCall],
        accomplishes:
          "“I can’t make Tuesday” removes the booking and the calendar event in the same call.",
        beats: [
          { toolId: null, text: "Caller says they need to cancel." },
          { toolId: TOOL_IDS.cancelBooking, text: "Cancel the booking row." },
          { toolId: TOOL_IDS.cancelCalendarEvent, text: "Remove the calendar event so 2:00 is open again." },
          { toolId: TOOL_IDS.endCall, text: "Hang up. The slot is sellable." },
        ],
      },
    ],
    other: {
      slug: "marketing-sales",
      title: "Marketing & Sales",
      body: "GHL lookup, upsert, free slots, and book — a demo-setter profile you assemble the same way.",
    },
  },
  "marketing-sales": {
    slug: "marketing-sales",
    title: "Marketing & Sales",
    documentTitle: "Marketing & Sales tools — Speeko",
    kicker: "Marketing & Sales",
    headline: "Tools that book the next step, then stop talking.",
    lead: "A demo-setter is a custom profile: GHL contact tools plus free slots plus schedule. Qualification is the task; the tools are how a meeting actually lands.",
    starterIds: [
      TOOL_IDS.endCall,
      TOOL_IDS.lookupGhlContact,
      TOOL_IDS.upsertGhlContact,
      TOOL_IDS.checkGhlFreeSlots,
      TOOL_IDS.scheduleGhlMeeting,
    ],
    helps: [
      {
        kicker: "Pipeline",
        title: "The demo exists on the calendar",
        body: "Open slots, then schedule. The agent does not say “you’re booked” unless the GHL tool returns ok.",
      },
      {
        kicker: "New leads",
        title: "No contact yet still gets a meeting",
        body: "Upsert writes the person into GHL first. Schedule never creates contacts on its own — so you do not get ghost appointments.",
      },
    ],
    playbooks: [
      {
        id: "demo-known",
        title: "Book a demo for a known contact",
        job: "Outbound · GoHighLevel",
        toolIds: [
          TOOL_IDS.lookupGhlContact,
          TOOL_IDS.checkGhlFreeSlots,
          TOOL_IDS.scheduleGhlMeeting,
          TOOL_IDS.endCall,
        ],
        accomplishes:
          "Sofia is found in GHL, Thursday 10:00 is an open slot, the meeting is on that contact — then hangup.",
        beats: [
          { toolId: TOOL_IDS.lookupGhlContact, text: "Lookup sofia@brightline.care. Save the contact id on the call." },
          { toolId: TOOL_IDS.checkGhlFreeSlots, text: "Thursday morning → 10:00 and 11:30 are open. Never show existing meetings." },
          { toolId: TOOL_IDS.scheduleGhlMeeting, text: "Book “Demo — Sofia Chen” at 10:00. Do not say booked unless this returns ok." },
          { toolId: TOOL_IDS.endCall, text: "Hang up. The calendar is the source of truth." },
        ],
      },
      {
        id: "demo-new",
        title: "New lead, then book",
        job: "Outbound · no GHL contact yet",
        toolIds: [
          TOOL_IDS.upsertGhlContact,
          TOOL_IDS.checkGhlFreeSlots,
          TOOL_IDS.scheduleGhlMeeting,
          TOOL_IDS.endCall,
        ],
        accomplishes:
          "A name and phone that GHL has never seen still get a contact, then a real slot. Schedule does not create contacts on its own.",
        beats: [
          { toolId: TOOL_IDS.upsertGhlContact, text: "Write Marcus Hale + phone into GHL. Keep the id on the call." },
          { toolId: TOOL_IDS.checkGhlFreeSlots, text: "Offer only open times." },
          { toolId: TOOL_IDS.scheduleGhlMeeting, text: "Place the meeting on that new contact." },
          { toolId: TOOL_IDS.endCall, text: "Hang up once the tool says ok." },
        ],
      },
      {
        id: "interview",
        title: "Schedule an interview",
        job: "Outbound · Nylas calendar",
        toolIds: [
          TOOL_IDS.checkCalendarAvailability,
          TOOL_IDS.createCalendarEvent,
          TOOL_IDS.endCall,
        ],
        accomplishes:
          "Confirm you have James, congratulate, then book a 30-minute slot that the calendar said was free.",
        beats: [
          { toolId: null, text: "Confirm the name. Congratulate — they were selected." },
          { toolId: TOOL_IDS.checkCalendarAvailability, text: "Wednesday afternoon → 2:00 and 3:30 open." },
          { toolId: TOOL_IDS.createCalendarEvent, text: "Create “Interview — James Okonkwo” at 2:00." },
          { toolId: TOOL_IDS.endCall, text: "Hang up. Invite is on the calendar." },
        ],
      },
      {
        id: "not-a-fit",
        title: "Not a fit — don’t fake a meeting",
        job: "Outbound qualify",
        toolIds: [TOOL_IDS.transferCall, TOOL_IDS.endCall],
        accomplishes:
          "If they want a human or they are not a buyer, the agent transfers or hangs up. It does not book an empty demo.",
        beats: [
          { toolId: null, text: "Discovery shows no timeline, or they ask for a person." },
          { toolId: TOOL_IDS.transferCall, text: "Optional: hand to sales." },
          { toolId: TOOL_IDS.endCall, text: "Or hang up with DECLINED / NOT_BOOKED. No ghost event." },
        ],
      },
    ],
    other: {
      slug: "customer-service",
      title: "Customer Service",
      body: "Confirm, after-hours book, cancel, transfer — the same tool list, a clinic-shaped profile.",
    },
  },
};

export const OPTIONAL_TOOL_IDS: KnownToolId[] = TOOL_COPY.filter(
  (t) => t.id !== TOOL_IDS.endCall,
).map((t) => t.id);

export const HUB_STARTER_IDS: KnownToolId[] = [
  TOOL_IDS.endCall,
  TOOL_IDS.lookupCustomer,
  TOOL_IDS.confirmAppointment,
];

export type AgentHelpCard = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
};

/** Concrete jobs an assembled profile can finish — not feature bullets. */
export const AGENT_HELPS: AgentHelpCard[] = [
  {
    id: "nights",
    kicker: "Coverage",
    title: "Answer when the desk is dark",
    body: "After-hours inbound still looks someone up, offers a real free slot, or transfers. The book is updated before anyone is back in the morning.",
    href: "/solutions/customer-service",
  },
  {
    id: "list",
    kicker: "Outbound",
    title: "Work tomorrow’s list",
    body: "Confirm, reschedule, or cancel against the booking id. Voicemail is not a workflow — the list row is done when the call ends.",
    href: "/solutions/customer-service",
  },
  {
    id: "pipeline",
    kicker: "Sales",
    title: "Put the next meeting on the calendar",
    body: "Find or create the GHL contact, read open slots, book. Qualification is the task; the tools are how the demo actually lands.",
    href: "/solutions/marketing-sales",
  },
  {
    id: "humans",
    kicker: "Handoff",
    title: "Leave humans the exceptions",
    body: "Billing disputes, clinical questions, “I want a person” — transfer with a reason. Everything else hangs up clean.",
    href: "/solutions/customer-service",
  },
];

export type AgentFitStep = {
  step: string;
  title: string;
  body: string;
};

export const AGENT_FIT: AgentFitStep[] = [
  {
    step: "01",
    title: "Persona talks",
    body: "The system prompt is who the agent is — company, tone, policies. It does not contain the booking steps.",
  },
  {
    step: "02",
    title: "Tools act",
    body: "Only enabled ids can run. No calendar on the profile means it cannot check or create events, no matter what it says.",
  },
  {
    step: "03",
    title: "Your stack stays the book",
    body: "Nylas or GoHighLevel holds the slots. The CRM enqueues the call. Speeko does not invent a second calendar.",
  },
];

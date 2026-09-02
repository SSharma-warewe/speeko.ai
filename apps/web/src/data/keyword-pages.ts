import type { KeywordPath } from "./marketing-routes";

export type KeywordFaq = {
  q: string;
  a: string;
};

export type KeywordRelated = {
  to: string;
  kicker: string;
  title: string;
  body: string;
};

export type KeywordTape = {
  name: string;
  meta: string;
  line: string;
  stamp: string;
};

export type KeywordOutcome = {
  verb: string;
  body: string;
};

export type KeywordBeat = {
  mark: string;
  title: string;
  body: string;
};

export type KeywordContrast = {
  leftTitle: string;
  left: string;
  rightTitle: string;
  right: string;
};

export type KeywordPageCopy = {
  path: KeywordPath;
  kicker: string;
  h1: string;
  dek: string;
  chips: string[];
  tape: KeywordTape;
  outcomes: KeywordOutcome[];
  job: KeywordBeat[];
  contrast: KeywordContrast;
  goLive: string;
  faqs: KeywordFaq[];
  related: KeywordRelated[];
  closeTitle: string;
  closeBody: string;
};

export const KEYWORD_NAV = [
  {
    to: "/ai-voice-agent",
    title: "AI voice agent",
    sub: "Inbound + outbound that can act",
  },
  {
    to: "/appointment-confirmation-calls",
    title: "Appointment calls",
    sub: "Confirm, move, or cancel live",
  },
  {
    to: "/ai-receptionist",
    title: "AI receptionist",
    sub: "After-hours and overflow inbound",
  },
  {
    to: "/outbound-ai-calling",
    title: "Outbound calling",
    sub: "Queue, retry, then talk",
  },
  {
    to: "/ai-calling-for-clinics",
    title: "Clinics",
    sub: "Front-desk confirmations",
  },
] as const;

export const KEYWORD_PAGES: KeywordPageCopy[] = [
  {
    path: "/ai-voice-agent",
    kicker: "Product",
    h1: "An AI voice agent that finishes the call.",
    dek: "Inbound rings and outbound dials. Tools write the outcome. Not a transcript sitting in a dashboard.",
    chips: ["Inbound", "Outbound", "Tools", "SIP"],
    tape: {
      name: "Elena Vasquez",
      meta: "Outbound · Dr. Patel 9:30",
      line: "I’ll mark you confirmed. See you tomorrow.",
      stamp: "CONFIRMED",
    },
    outcomes: [
      {
        verb: "Writes back",
        body: "Confirm, book, cancel, transfer, hang up — only the tools you enabled. The row is not “AI handled it.”",
      },
      {
        verb: "Both directions",
        body: "Inbound on a number you already have. Outbound from a queue with retries. Same persona, different task.",
      },
      {
        verb: "Voice that holds",
        body: "Talent, pace, barge-in. The first second does not sound like hold music, so they stay for the job.",
      },
    ],
    job: [
      {
        mark: "01",
        title: "Speech is the interface",
        body: "It answers or places the call in a voice you pick. Chatbots and IVR trees are the wrong comparison — people hang up on menus.",
      },
      {
        mark: "02",
        title: "The task is the job",
        body: "Persona is who they are. The task is what this call must finish: confirm, qualify, book a demo. Inbound stores a default; outbound picks it per dial.",
      },
      {
        mark: "03",
        title: "Tools, not a longer prompt",
        body: "Hangup is always on. Lookup, calendar, GoHighLevel, transfer are opt-in. If a verb is not on the profile, the agent cannot pretend it ran.",
      },
      {
        mark: "04",
        title: "The line clears",
        body: "When the job is done — or they ask to stop — hangup deletes the room. No orphan legs holding a dial slot.",
      },
    ],
    contrast: {
      leftTitle: "What they hang up on",
      left: "A menu. A reminder that says call us back. A voice that cannot look them up or write a result.",
      rightTitle: "What Speeko writes",
      right: "A finished task on the call tape: confirmed, booked, transferred, or hung up — with the tools that actually ran.",
    },
    goLive:
      "Bring a Telnyx, Twilio, or SIP number. Name the agent, switch on tools, publish inbound or enqueue outbound. No code. No new carrier.",
    faqs: [
      {
        q: "Is Speeko an AI voice agent or a chatbot?",
        a: "A phone voice agent. It places and answers calls over SIP, speaks, listens with barge-in, and runs tools. It is not a website chat widget.",
      },
      {
        q: "Can one Speeko agent do inbound and outbound?",
        a: "Yes. Inbound and outbound are named configs on the same platform. Inbound carries a default task on the agent. Outbound picks the task per call, batch, or CRM endpoint.",
      },
      {
        q: "Do I need to replace my phone provider?",
        a: "No. You bring a virtual number from Telnyx, Twilio, or your SIP carrier and point it at Speeko.",
      },
      {
        q: "What can the agent actually do on the call?",
        a: "Whatever you enabled on the tool profile: hang up, lookup, confirm, book, cancel, transfer, calendar free/busy, GoHighLevel contacts and meetings. Unenabled tools do not run.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "Confirm, reschedule, or cancel while they are still on the line.",
      },
      {
        to: "/ai-receptionist",
        kicker: "Use case",
        title: "AI receptionist",
        body: "Inbound that answers, looks up, and transfers the rest.",
      },
      {
        to: "/outbound-ai-calling",
        kicker: "Use case",
        title: "Outbound AI calling",
        body: "A dial queue with retries, not a one-shot blast.",
      },
    ],
    closeTitle: "Hear it on a live number.",
    closeBody: "Bring a Telnyx or Twilio number. Leave with an agent that can act.",
  },
  {
    path: "/appointment-confirmation-calls",
    kicker: "Use case",
    h1: "Confirm the visit while they're still on the line.",
    dek: "The book has to change. Confirmed, moved, or cancelled — not a voicemail your desk replays.",
    chips: ["Confirm", "Reschedule", "Cancel", "Lookup"],
    tape: {
      name: "Elena Vasquez",
      meta: "Dr. Patel · tomorrow 9:30 AM",
      line: "Yes, I’ll be there. · Marked confirmed.",
      stamp: "CONFIRMED",
    },
    outcomes: [
      {
        verb: "Confirmed",
        body: "The visit stays. Tomorrow’s list is actually worked — not a reminder that still needs a human.",
      },
      {
        verb: "Moved",
        body: "Reschedule writes a new time against the booking id. Calendar tools check a slot is really open.",
      },
      {
        verb: "Cancelled",
        body: "The slot is free the minute they say they cannot make it. After hours still counts.",
      },
    ],
    job: [
      {
        mark: "01",
        title: "Cite the visit",
        body: "Name, time, provider, booking id ride on the call. Lookup prefers those fields so it is not “who am I speaking with.”",
      },
      {
        mark: "02",
        title: "Talk, then write",
        body: "Confirm-appointment stores CONFIRMED, RESCHEDULED, or CANCELLED. A “please call us back” reminder is still your staff’s job.",
      },
      {
        mark: "03",
        title: "Outbound list or inbound ring",
        body: "Enqueue tomorrow’s appointments; the queue retries no-answer and busy. Or they call you — same persona, same tools.",
      },
      {
        mark: "04",
        title: "Hangup when it’s done",
        body: "The line clears. Incomplete hangups are not silently redialed as if nobody picked up.",
      },
    ],
    contrast: {
      leftTitle: "A reminder blast",
      left: "One-way audio. “Reply 1 to confirm.” They don’t. Your desk spends the morning on the ones who never did.",
      rightTitle: "A finished confirmation",
      right: "They said yes, Thursday, or cancel. The book already shows it. Staff keep the exceptions.",
    },
    goLive:
      "Push tomorrow’s list with name, time, and booking id — portal bulk or a CRM POST. Same number patients already know.",
    faqs: [
      {
        q: "Is this just an appointment reminder robocall?",
        a: "No. The agent talks, handles confirm / reschedule / cancel, and writes the result back. A one-way reminder blast is a different product.",
      },
      {
        q: "Can it reschedule, not only confirm?",
        a: "Yes. Confirm-appointment stores CONFIRMED, RESCHEDULED, or CANCELLED. Calendar tools check open slots when you enable them.",
      },
      {
        q: "Do you need our EHR?",
        a: "No rip-and-replace. Speeko talks over SIP on your number and writes through the tools you connect — CRM context, calendar, or a thin enqueue from the system you already have.",
      },
      {
        q: "What if nobody picks up?",
        a: "Outbound retries under your queue settings (no-answer, busy, backoff, max attempts). The row is not marked completed unless the task actually finished.",
      },
    ],
    related: [
      {
        to: "/ai-calling-for-clinics",
        kicker: "Vertical",
        title: "AI calling for clinics",
        body: "Front-desk confirmations on the number you already publish.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "Inbound and outbound, tools on a profile, SIP you bring.",
      },
      {
        to: "/outbound-ai-calling",
        kicker: "Use case",
        title: "Outbound AI calling",
        body: "How the dial queue claims, dials, and retries.",
      },
    ],
    closeTitle: "Put confirmations on a number.",
    closeBody: "Same tools in the portal. Pick the task, enqueue tomorrow’s list.",
  },
  {
    path: "/ai-receptionist",
    kicker: "Use case",
    h1: "The inbound line that actually answers.",
    dek: "Overflow and after hours. Look them up. Finish what the tools allow. Transfer the rest.",
    chips: ["Inbound", "Lookup", "Transfer", "After hours"],
    tape: {
      name: "James Okonkwo",
      meta: "Inbound · after hours",
      line: "I can take that booking, or put you through at 8.",
      stamp: "BOOKED",
    },
    outcomes: [
      {
        verb: "Picks up",
        body: "No voicemail pile. A voice you set greets immediately — closed hours and overflow included.",
      },
      {
        verb: "Knows who",
        body: "Lookup by phone, email, or name. Known callers get the right visit. Unknown callers get intake, not a 12-option tree.",
      },
      {
        verb: "Hands off",
        body: "Transfer is how billing, clinical questions, and angry callers leave the agent with a reason attached.",
      },
    ],
    job: [
      {
        mark: "01",
        title: "The number still rings you",
        body: "Publish an inbound trunk and a dispatch rule. Point Telnyx, Twilio, or your carrier at Speeko. Patients keep the number on the card.",
      },
      {
        mark: "02",
        title: "Greet, then decide",
        body: "Opening line in the talent on the Voice tab. Then lookup. Then book, confirm, cancel — or transfer. The agent does not role-play a nurse.",
      },
      {
        mark: "03",
        title: "A persona, not a shared inbox",
        body: "One number can be a confirmation agent. Another a general receptionist. Dispatch packs the default task.",
      },
      {
        mark: "04",
        title: "Staff see the tape",
        body: "Transcript, tool events, completed vs hung up incomplete. Not a black box that “handled it.”",
      },
    ],
    contrast: {
      leftTitle: "Hold, then voicemail",
      left: "Overflow waits. After hours dumps to a box. Morning is a callback list that is already late.",
      rightTitle: "Answered, then written",
      right: "They got a person-sounding voice, a lookup, and either a finished job or a human with context.",
    },
    goLive:
      "Draft the inbound trunk, attach a dispatch rule to a named agent, publish. Transfer stays on the profile for desk hours.",
    faqs: [
      {
        q: "Will it replace the front desk?",
        a: "It takes the calls the desk cannot get to — after hours, overflow, routine confirm/book. Transfer stays available for everything that needs a human.",
      },
      {
        q: "How does a caller reach Speeko?",
        a: "You publish an inbound SIP trunk and a dispatch rule, then point Telnyx, Twilio, or your carrier at Speeko for those numbers.",
      },
      {
        q: "Can it book, or only take a message?",
        a: "If book / calendar / GHL meeting tools are on the profile and a calendar is linked, it can take a real slot. Otherwise it should transfer or hang up — it should not promise a time it cannot write.",
      },
      {
        q: "What does the caller hear first?",
        a: "Your opening line (or the built-in default), in the talent and pace on the Voice tab. Empty opening is allowed if you want silence; most receptionists should greet.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The inbound job most clinics actually need finished.",
      },
      {
        to: "/voice",
        kicker: "Voice",
        title: "Voice people stay on",
        body: "Talent, pace, delivery, barge-in — the first second.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "How inbound and outbound share tools and persona.",
      },
    ],
    closeTitle: "Put a receptionist on the overflow line.",
    closeBody: "Bring the number. Pick lookup, book, transfer. Publish.",
  },
  {
    path: "/outbound-ai-calling",
    kicker: "Use case",
    h1: "Outbound calls that retry until they connect.",
    dek: "A queue with a cap, not a blast. No-answer comes back. Completed means the task finished.",
    chips: ["Queue", "Retries", "Outreach", "CRM"],
    tape: {
      name: "Sofia Chen",
      meta: "Attempt 2 · demo-set",
      line: "Thursday at 2 is open. I’ll put it on the calendar.",
      stamp: "BOOKED",
    },
    outcomes: [
      {
        verb: "Queued",
        body: "One call or a batch. The dialer claims rows under your concurrency and rate. You can pause without deleting the list.",
      },
      {
        verb: "Retried",
        body: "No-answer, busy, SIP error — if the code is in retry_on, it comes back with backoff and quiet hours.",
      },
      {
        verb: "Completed",
        body: "Only when the task actually finished. A hangup mid-sentence is incomplete, not a silent redial.",
      },
    ],
    job: [
      {
        mark: "01",
        title: "The API owns the dialer",
        body: "Enqueue pending calls. A dialer places the SIP leg. The voice worker never dials and never talks to your database.",
      },
      {
        mark: "02",
        title: "Task per dial",
        body: "Outbound agents do not store a default task. You pick it on the call, batch, or integration: qualify, demo-set, confirm, interview.",
      },
      {
        mark: "03",
        title: "CRM sends a thin request",
        body: "The endpoint bakes in agent, task, trunk. Your CRM posts a phone number plus optional context. Same queue as bulk.",
      },
      {
        mark: "04",
        title: "Meetings need calendar tools",
        body: "Qualification is talk. A meeting landing is free slots + book. Leave those ids off and the agent writes nothing.",
      },
    ],
    contrast: {
      leftTitle: "A one-shot blast",
      left: "Fire the list once. No-answer is dead. No cap. No quiet hours. It sounds like a robocall farm because it is one.",
      rightTitle: "A queued campaign",
      right: "Concurrency, retries, pause, cancel. The row tells you attempt, last failure, and whether the task completed.",
    },
    goLive:
      "Outbound trunk, named agent, task on the call or endpoint. Enqueue. The dialer respects your cap.",
    faqs: [
      {
        q: "Is this auto-dialer spam?",
        a: "It is a queued outbound agent with caps, retries, and a task. You bring the numbers and the consent. Speeko does not scrape lists or run a shared calling pool.",
      },
      {
        q: "What happens on no-answer?",
        a: "The worker reports failed / no_answer. If that code is in retry_on and attempts remain, the row returns to pending after backoff. Otherwise it stays failed.",
      },
      {
        q: "Can we pause a campaign?",
        a: "Yes. Pause the org queue or a single batch. Pending calls sit. Cancel a batch and pending rows go cancelled.",
      },
      {
        q: "How do we start a call from GoHighLevel or another CRM?",
        a: "Create an integration endpoint in the portal (agent, task, trunk). The CRM POSTs phoneNumber plus optional context and API key. Same queue as bulk enqueue.",
      },
    ],
    related: [
      {
        to: "/solutions/marketing-sales",
        kicker: "Tools",
        title: "Marketing & sales stack",
        body: "GHL contacts, free slots, schedule — how a meeting actually lands.",
      },
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The other outbound job: tomorrow’s list, written back.",
      },
      {
        to: "/ai-voice-agent",
        kicker: "Product",
        title: "AI voice agent",
        body: "Persona, tools, and SIP on one platform.",
      },
    ],
    closeTitle: "Enqueue a real list.",
    closeBody: "One call or fifty. The queue respects your cap and retries.",
  },
  {
    path: "/ai-calling-for-clinics",
    kicker: "Clinics",
    h1: "Front desk calls without a new EHR.",
    dek: "Tomorrow’s confirmations on the number patients already know. The chart stays where it is.",
    chips: ["Clinics", "Confirmations", "SIP", "No new EHR"],
    tape: {
      name: "Priya Shah",
      meta: "Dr. Nguyen · 8:00 AM",
      line: "I can’t do 8. Thursday at 2 works. · Moved.",
      stamp: "RESCHEDULED",
    },
    outcomes: [
      {
        verb: "Desk keeps exceptions",
        body: "Routine confirm / move / cancel leaves the line. Clinical questions, billing, upset families transfer.",
      },
      {
        verb: "Same number",
        body: "Telnyx, Twilio, or SIP you already publish. Patients do not learn a new line.",
      },
      {
        verb: "Chart stays",
        body: "No EHR migration. Booking ids come in as context. Write-back is the tools you connect.",
      },
    ],
    job: [
      {
        mark: "01",
        title: "Cite provider and time",
        body: "Context on the call so it does not sound like a robocall farm. Talent and barge-in on the Voice tab.",
      },
      {
        mark: "02",
        title: "Write the visit",
        body: "Confirm, reschedule, or cancel against the booking id. After-hours “I can’t make 8” still frees the slot tonight.",
      },
      {
        mark: "03",
        title: "New-patient later",
        body: "Many clinics start with confirmations only. Add book and calendar when the desk is ready.",
      },
      {
        mark: "04",
        title: "Morning tape",
        body: "Staff see who confirmed, who moved, who hung up incomplete. No mystery AI.",
      },
    ],
    contrast: {
      leftTitle: "The morning callback list",
      left: "Voicemail from last night. No-shows you could have moved. The desk is already behind before doors open.",
      rightTitle: "The list, already worked",
      right: "Confirmed, moved, or cancelled on the tape. Humans take what the tools cannot write.",
    },
    goLive:
      "Clinic SIP in. Confirmation agent live. Tomorrow’s list in the queue — portal or the system you already have.",
    faqs: [
      {
        q: "Do we have to switch phone systems?",
        a: "No. Point your existing virtual number (Telnyx, Twilio, or SIP) at Speeko. Patients keep the number on the card.",
      },
      {
        q: "Will this replace our EHR?",
        a: "No. Speeko is the voice layer. Booking ids and names come in as call context. Write-back is the confirm/book/cancel/calendar tools you connect — not a new chart.",
      },
      {
        q: "Can it handle new-patient booking?",
        a: "If book and calendar tools are enabled and a calendar is linked, yes. Many clinics start with confirmations only, then add booking.",
      },
      {
        q: "What about clinical advice?",
        a: "Persona policy plus transfer. The agent should not give medical advice. Clinical questions go to a human; the tools are for the visit logistics.",
      },
    ],
    related: [
      {
        to: "/appointment-confirmation-calls",
        kicker: "Use case",
        title: "Appointment confirmation calls",
        body: "The job: confirm, reschedule, cancel, written back.",
      },
      {
        to: "/ai-receptionist",
        kicker: "Use case",
        title: "AI receptionist",
        body: "Overflow and after-hours inbound on the clinic line.",
      },
      {
        to: "/solutions/customer-service",
        kicker: "Tools",
        title: "Customer service tools",
        body: "The kit: hangup, lookup, confirm, calendar, transfer.",
      },
    ],
    closeTitle: "Try it on tomorrow’s list.",
    closeBody: "Same number patients already call. Confirmations that write back.",
  },
];

export const KEYWORD_PAGE_BY_PATH: Record<KeywordPath, KeywordPageCopy> =
  Object.fromEntries(KEYWORD_PAGES.map((page) => [page.path, page])) as Record<
    KeywordPath,
    KeywordPageCopy
  >;
